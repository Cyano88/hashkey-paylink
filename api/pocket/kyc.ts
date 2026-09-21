import type { Request, Response } from 'express'
import { createHash, randomUUID } from 'node:crypto'
import { verifiedPrivyUser } from '../local-currency-profile.js'
import { readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import { smileConfig, smileRequest, validSmileSignature, type SmileConfig, type SmileEnvironment } from './smile-provider.js'

type Job = { id: string; userId: string; environment: SmileEnvironment; status: 'pending' | 'passed' | 'failed' | 'review'; createdAt: number; checkedAt?: number; uploadReportedAt?: number; submitted?: boolean; providerMissing?: boolean; resultCode?: string; legalName?: string }
type RecordState = { jobs: Job[] }
const key = (userId: string, environment: SmileEnvironment) => `hashpaylink:pocket-kyc:v1:${environment}:${createHash('sha256').update(userId).digest('hex')}`
export const smileUserId = (userId: string) => `pocket_${createHash('sha256').update(userId).digest('hex')}`
const jobKey = (id: string) => `hashpaylink:pocket-kyc-job:v1:${id}`
const fail = (message: string, status: number) => Object.assign(new Error(message), { status })

export function publicKyc(job: Job | undefined, environment: SmileEnvironment) {
  return { environment, status: job?.status || 'not_started', verified: environment === 'production' && job?.status === 'passed', jobId: job?.id || null, canResume: job?.status === 'pending' && job.providerMissing === true && !job.submitted && !job.uploadReportedAt, uploadReported: Boolean(job?.uploadReportedAt) }
}

export async function requireProductionKyc(userId: string) {
  const record = await readDurableJson<RecordState>(key(userId, 'production'))
  const job = record?.jobs.find(item => item.status === 'passed' && item.environment === 'production')
  if (!job?.legalName) throw fail('Complete identity verification before setting up your POS.', 403)
  return job.legalName
}

async function reconcile(config: SmileConfig, owner: string, selected: Job) {
  if (selected.status === 'passed' || (selected.status !== 'pending' && selected.resultCode) || Date.now() - (selected.checkedAt || 0) < 15000) return selected
  let claimed = false
  await mutateDurableJson<RecordState>(key(owner, config.environment), current => {
    if (!current) throw fail('Verification not found.', 404)
    const job = current.jobs.find(item => item.id === selected.id)
    if (job && job.status !== 'passed' && !job.resultCode && Date.now() - (job.checkedAt || 0) >= 15000) { job.checkedAt = Date.now(); claimed = true }
    return current
  })
  if (!claimed) return selected
  // Callback fields are only a notification. Fetch authoritative results with our credentials.
  const data = await smileRequest(config, 'job_status', { user_id: selected.userId, job_id: selected.id, history: false, image_links: false })
  const result = data.result || {}
  const params = result.PartnerParams
  if (params && (params.job_id !== selected.id || params.user_id !== selected.userId || String(params.job_type) !== '1')) throw fail('Verification reference did not match.', 502)
  const saved = await mutateDurableJson<RecordState>(key(owner, config.environment), current => {
    if (!current) throw fail('Verification not found.', 404)
    const job = current.jobs.find(item => item.id === selected.id)
    if (!job || job.status === 'passed' || (job.status !== 'pending' && job.resultCode)) return current
    if (data.job_found === true && data.job_complete !== true) job.status = 'pending'
    job.providerMissing = data.job_found === false
    job.submitted = data.job_found === true || data.job_complete === true || job.submitted
    if (data.job_complete === true) {
      job.resultCode = String(result.ResultCode || '').slice(0, 16)
      // Unknown/incomplete successes stay in review; never infer approval from HTTP 200.
      const country = String(result.Country || result.IDInfo?.country || '').toUpperCase()
      const legalName = [result.FirstName, result.MiddleName, result.LastName].filter(value => typeof value === 'string').join(' ').replace(/\s+/g, ' ').trim().slice(0, 160)
      const approved = data.job_success === true && job.resultCode === '0810' && params && country === 'NG' && legalName
      job.status = approved ? 'passed' : data.job_success === false ? 'failed' : 'review'
      if (approved) job.legalName = legalName
    } else if (data.job_found === false && !job.submitted && Date.now() - job.createdAt > 20 * 60_000) {
      job.status = 'review'
    } else if (Date.now() - job.createdAt > 24 * 60 * 60_000) job.status = 'review'
    return current
  })
  return saved.jobs.find(job => job.id === selected.id)!
}

export default async function pocketKyc(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  try {
    const identity = await verifiedPrivyUser(req)
    const action = req.body?.action
    if (action === 'eligibility') {
      try { const legalName = await requireProductionKyc(identity.userId); return res.json({ ok: true, verified: true, legalName }) }
      catch (error) { if ((error as { status?: number }).status === 403) { const config = smileConfig(); const record = await readDurableJson<RecordState>(key(identity.userId, config.environment)); return res.json({ ok: true, ...publicKyc(record?.jobs.at(-1), config.environment), verified: false }) }; throw error }
    }
    const config = smileConfig()
    if (!['status', 'start', 'resume', 'uploaded'].includes(action)) throw fail('Invalid verification action.', 400)
    const storageKey = key(identity.userId, config.environment)
    const record = await readDurableJson<RecordState>(storageKey)
    const latest = record?.jobs.at(-1)
    if (action === 'uploaded') {
      if (!latest || req.body.jobId !== latest.id) throw fail('Verification reference did not match.', 409)
      const saved = await mutateDurableJson<RecordState>(storageKey, current => {
        const job = current?.jobs.find(item => item.id === latest.id)
        if (job?.status === 'pending') { job.uploadReportedAt ||= Date.now(); job.providerMissing = false }
        return current || { jobs: [] }
      })
      return res.json({ ok: true, ...publicKyc(saved.jobs.at(-1), config.environment) })
    }
    if (action === 'status') {
      const job = latest ? await reconcile(config, identity.userId, latest) : undefined
      return res.json({ ok: true, ...publicKyc(job, config.environment) })
    }
    if (req.body.consent !== true) throw fail('Please consent to identity verification first.', 400)
    if (action === 'resume' && (!latest || latest.status !== 'pending' || !latest.providerMissing || latest.submitted || latest.uploadReportedAt)) throw fail('Check progress before continuing verification.', 409)
    const candidate: Job = action === 'resume' ? latest! : { id: `pkyc_${randomUUID().replaceAll('-', '')}`, userId: smileUserId(identity.userId), environment: config.environment, status: 'pending', createdAt: Date.now() }
    if (action === 'start') await mutateDurableJson<RecordState>(storageKey, current => {
      const jobs = current?.jobs || []
      if (jobs.some(job => ['pending', 'passed', 'review'].includes(job.status))) throw fail('Check your existing verification before starting another.', 409)
      if (jobs.filter(job => Date.now() - job.createdAt < 86400000).length >= 5) throw fail('Daily verification attempt limit reached. Try again tomorrow.', 429)
      return { jobs: [...jobs.slice(-19), candidate] }
    })
    await mutateDurableJson<{ owner: string; environment: SmileEnvironment }>(jobKey(candidate.id), () => ({ owner: identity.userId, environment: config.environment }))
    try {
      const token = await smileRequest(config, 'token', { user_id: candidate.userId, job_id: candidate.id, product: 'biometric_kyc', callback_url: config.callbackUrl })
      if (typeof token.token !== 'string' || !token.token) throw fail('Smile ID returned an invalid session.', 502)
      return res.json({ ok: true, ...publicKyc(candidate, config.environment), token: token.token, partnerId: config.partnerId, callbackUrl: config.callbackUrl })
    } catch (error) {
      // A token request does not submit an identity job. No client received the failed session.
      if (action === 'start') await mutateDurableJson<RecordState>(storageKey, current => {
        const job = current?.jobs.find(item => item.id === candidate.id)
        if (job?.status === 'pending') job.status = 'failed'
        return current || { jobs: [] }
      })
      throw error
    }
  } catch (error) {
    const status = (error as { status?: number }).status || 503
    return res.status(status).json({ ok: false, error: status < 500 ? (error as Error).message : 'Identity verification could not load. Please try again.' })
  }
}

export async function pocketKycCallback(req: Request, res: Response) {
  try {
    const config = smileConfig()
    const body = req.body || {}
    if (!validSmileSignature(config, body)) return res.status(401).json({ ok: false })
    const params = body.PartnerParams
    if (!/^pkyc_[a-f0-9]{32}$/.test(params?.job_id || '')) return res.status(400).json({ ok: false })
    const index = await readDurableJson<{ owner: string; environment: SmileEnvironment }>(jobKey(params.job_id))
    if (!index || index.environment !== config.environment || params.user_id !== smileUserId(index.owner) || String(params.job_type) !== '1') return res.status(404).json({ ok: false })
    const record = await readDurableJson<RecordState>(key(index.owner, index.environment))
    const job = record?.jobs.find(item => item.id === params.job_id)
    if (!job) return res.status(404).json({ ok: false })
    await reconcile(config, index.owner, job)
    return res.json({ ok: true })
  } catch { return res.status(503).json({ ok: false }) }
}
