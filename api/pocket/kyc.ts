import pocketKycV3, { pocketKycV3Callback, requireV3ProductionKyc } from './kyc-v3.js'
import { startKycPolicy, storedKycPolicy, matchesKycPolicy, type PocketKycContext } from './kyc-policy.js'
import type { Request, Response } from 'express'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { verifiedPrivyUser } from '../local-currency-profile.js'
import { readDurableJson, mutateDurableJson } from '../render-durable-store.js'
import { smileConfig, smileRequest, validSmileSignature, type SmileConfig, type SmileEnvironment } from './smile-provider.js'

export type Job = PocketKycContext & { id: string; userId: string; environment: SmileEnvironment; status: 'pending' | 'passed' | 'failed' | 'review'; createdAt: number; checkedAt?: number; uploadReportedAt?: number; submitted?: boolean; providerMissing?: boolean; resultCode?: string; legalName?: string; identityMatch?: string; bvnJobId?: string; failureReason?: string }
type RecordState = { jobs: Job[] }
const key = (userId: string, environment: SmileEnvironment) => `hashpaylink:pocket-kyc:v1:${environment}:${createHash('sha256').update(userId).digest('hex')}`
export const smileUserId = (userId: string) => `pocket_${createHash('sha256').update(userId).digest('hex')}`
const jobKey = (id: string) => `hashpaylink:pocket-kyc-job:v1:${id}`
const fail = (message: string, status: number) => Object.assign(new Error(message), { status })

export function publicKyc(job: Job | undefined, environment: SmileEnvironment) {
  return { environment, verification: storedKycPolicy(job), status: job?.status || 'not_started', verified: environment === 'production' && job?.status === 'passed' && Boolean(job.bvnJobId), jobId: job?.id || null, canResume: Boolean(job && ['pending', 'review'].includes(job.status) && !job.resultCode) && job?.providerMissing === true && !job.submitted && !job.uploadReportedAt, uploadReported: Boolean(job?.uploadReportedAt), failureReason: job?.failureReason || (job?.status === 'failed' ? job.resultCode === '0811' ? 'face_mismatch' : job.resultCode ? 'provider_rejected' : 'session_failed' : null) }
}

function methodOf(job: Job) { return storedKycPolicy(job).method }
function approvedBvn(jobs: Job[], environment: SmileEnvironment) {
  return jobs.find(job => job.environment === environment && job.status === 'passed' && methodOf(job) === 'bvn')
}
function completedPair(jobs: Job[], environment: SmileEnvironment) {
  return jobs.find(job => job.environment === environment && job.status === 'passed' && methodOf(job) !== 'bvn' && jobs.some(bvn => bvn.id === job.bvnJobId && bvn.environment === environment && bvn.status === 'passed' && methodOf(bvn) === 'bvn' && bvn.identityMatch && bvn.identityMatch === job.identityMatch))
}
function publicFlow(jobs: Job[], environment: SmileEnvironment) {
  const latest = jobs.at(-1), bvn = approvedBvn(jobs, environment), complete = completedPair(jobs, environment)
  return { ...publicKyc(latest, environment), verified: environment === 'production' && Boolean(complete), workflow: { bvnPassed: Boolean(bvn), complete: Boolean(complete), needsAdditional: Boolean(bvn && !complete && (!latest || methodOf(latest) === 'bvn' || latest.status === 'failed')), methods: ['nin', 'government_id'] } }
}
function identityEvidence(config: SmileConfig, result: Record<string, any>) {
  const legalName = ([result.FirstName, result.MiddleName, result.LastName].filter(value => typeof value === 'string').join(' ') || (typeof result.FullName === 'string' ? result.FullName : '')).replace(/\s+/g, ' ').trim().slice(0,160)
  const dob = String(result.DOB || '')
  // Do not persist raw DOB or ID numbers. Missing/ambiguous evidence never matches.
  const validDob = /^\d{4}-\d{2}-\d{2}$/.test(dob) && !Number.isNaN(Date.parse(dob)) && new Date(dob).toISOString().slice(0,10) === dob
  const name = legalName.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N} ]/gu,'').split(/\s+/).filter(Boolean).sort().join(' ')
  const identityMatch = name && validDob ? createHmac('sha256', config.apiKey).update('pocket-identity-v1|'+name+'|'+dob).digest('hex') : undefined
  return { legalName, identityMatch }
}
export async function requireProductionKyc(userId: string) {
  try { return await requireV3ProductionKyc(userId) } catch (error) { if ((error as {status?:number}).status !== 403) throw error }
  const record = await readDurableJson<RecordState>(key(userId, 'production'))
  const job = completedPair(record?.jobs || [], 'production')
  if (!job?.legalName) throw fail('Complete identity verification before setting up your POS.', 403)
  return job.legalName
}

async function reconcile(config: SmileConfig, owner: string, selected: Job) {
  if (selected.status === 'passed' || selected.status === 'failed' && selected.resultCode || selected.failureReason === 'identity_mismatch' || Date.now() - (selected.checkedAt || 0) < 15000) return selected
  let claimed = false
  await mutateDurableJson<RecordState>(key(owner, config.environment), current => {
    if (!current) throw fail('Verification not found.', 404)
    const job = current.jobs.find(item => item.id === selected.id)
    if (job && !['passed', 'failed'].includes(job.status) && job.failureReason !== 'identity_mismatch' && Date.now() - (job.checkedAt || 0) >= 15000) { job.checkedAt = Date.now(); claimed = true }
    return current
  })
  if (!claimed) return selected
  // Callback fields are only a notification. Fetch authoritative results with our credentials.
  const data = await smileRequest(config, 'job_status', { user_id: selected.userId, job_id: selected.id, history: false, image_links: false })
  const result = data.result || {}
  const params = result.PartnerParams
  if (params && (params.job_id !== selected.id || params.user_id !== selected.userId || String(params.job_type) !== storedKycPolicy(selected).jobType)) throw fail('Verification reference did not match.', 502)
  const saved = await mutateDurableJson<RecordState>(key(owner, config.environment), current => {
    if (!current) throw fail('Verification not found.', 404)
    const job = current.jobs.find(item => item.id === selected.id)
    if (!job || job.status === 'passed' || job.status === 'failed' && job.resultCode || job.failureReason === 'identity_mismatch') return current
    if (data.job_found === true && data.job_complete !== true) job.status = 'pending'
    job.providerMissing = data.job_found === false
    job.submitted = data.job_found === true || data.job_complete === true || job.submitted
    if (data.job_complete === true) {
      job.resultCode = String(result.ResultCode || '').slice(0, 16)
      // Unknown/incomplete successes stay in review; never infer approval from HTTP 200.
      const country = String(result.Country || result.IDInfo?.country || '').toUpperCase()
      const { legalName, identityMatch } = identityEvidence(config, result)
      const policy = storedKycPolicy(job)
      const idType = String(result.IDType || result.IDInfo?.id_type || '')
      const typeMatches = policy.method === 'bvn' ? (['BVN', 'BVN_MFA'].includes(idType) || !idType && policy.policyVersion === 'ng-smile-bvn-v1') : policy.idSelection.NG.includes(idType)
      const approved = data.job_success === true && ['0810', '1210'].includes(job.resultCode) && params && matchesKycPolicy(job, country) && typeMatches && legalName && (identityMatch || policy.policyVersion === 'ng-smile-bvn-v1')
      const bvn = job.bvnJobId ? current.jobs.find(item => item.id === job.bvnJobId && item.environment === job.environment && item.status === 'passed' && methodOf(item) === 'bvn') : undefined
      const pairMatches = policy.method === 'bvn' || Boolean(bvn?.identityMatch && identityMatch && bvn.identityMatch === identityMatch)
      job.status = approved && pairMatches ? 'passed' : ['0812', '0814', '0815', '1213'].includes(job.resultCode) ? 'review' : data.job_success === false ? 'failed' : 'review'
      if (approved) { job.legalName = legalName; job.identityMatch = identityMatch }
      if (approved && !pairMatches) job.failureReason = 'identity_mismatch'
    } else if (data.job_found === false && !job.submitted && Date.now() - job.createdAt > 20 * 60_000) {
      job.status = 'review'
    } else if (Date.now() - job.createdAt > 24 * 60 * 60_000) job.status = 'review'
    return current
  })
  return saved.jobs.find(job => job.id === selected.id)!
}

export async function pocketLegacyKyc(req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })
  try {
    const identity = await verifiedPrivyUser(req)
    const action = req.body?.action
    if (action === 'eligibility') {
      try { const legalName = await requireProductionKyc(identity.userId); return res.json({ ok: true, verified: true, legalName }) }
      catch (error) { if ((error as { status?: number }).status === 403) { const config = smileConfig(); const record = await readDurableJson<RecordState>(key(identity.userId, config.environment)); return res.json({ ok: true, ...publicFlow(record?.jobs || [], config.environment), verified: false }) }; throw error }
    }
    const config = smileConfig()
    if (!['status', 'start', 'resume', 'uploaded'].includes(action)) throw fail('Invalid verification action.', 400)
    const storageKey = key(identity.userId, config.environment)
    const record = await readDurableJson<RecordState>(storageKey)
    let latest = record?.jobs.at(-1)
    if (action === 'uploaded') {
      if (!latest || req.body.jobId !== latest.id) throw fail('Verification reference did not match.', 409)
      const saved = await mutateDurableJson<RecordState>(storageKey, current => {
        const job = current?.jobs.find(item => item.id === latest.id)
        if (job?.status === 'pending') { job.uploadReportedAt ||= Date.now(); job.providerMissing = false }
        return current || { jobs: [] }
      })
      return res.json({ ok: true, ...publicFlow(saved.jobs, config.environment) })
    }
    if (action === 'status') {
      const job = latest ? await reconcile(config, identity.userId, latest) : undefined
      const refreshed = await readDurableJson<RecordState>(storageKey)
      return res.json({ ok: true, ...publicFlow(refreshed?.jobs || [], config.environment) })
    }
    const policy = action === 'resume' ? storedKycPolicy(latest) : startKycPolicy(req.body.country, req.body.method)
    if (action === 'resume' && req.body.method !== undefined && req.body.method !== policy.method) throw fail('Continue verification with its original method.', 409)
    if (action === 'resume' && req.body.country !== undefined && req.body.country !== policy.country) throw fail('Continue verification with its original country.', 409)
    if (action === 'resume' && latest && publicKyc(latest, config.environment).canResume) latest = await reconcile(config, identity.userId, latest)
    if (req.body.consent !== true) throw fail('Please consent to identity verification first.', 400)
    if (action === 'resume' && (!latest || !publicKyc(latest, config.environment).canResume)) throw fail('Check progress before continuing verification.', 409)
    if (action === 'start' && policy.method !== 'bvn') {
      const bvn = approvedBvn(record?.jobs || [], config.environment)
      if (!bvn) throw fail('Complete BVN verification first.', 409)
      if (!bvn.identityMatch) {
        const data = await smileRequest(config, 'job_status', { user_id: bvn.userId, job_id: bvn.id, history: false, image_links: false })
        const result = data.result || {}, params = result.PartnerParams
        const evidence = identityEvidence(config, result)
        if (data.job_complete !== true || data.job_success !== true || !['0810','1210'].includes(String(result.ResultCode)) || params?.job_id !== bvn.id || params?.user_id !== bvn.userId || String(params?.job_type) !== '1' || !matchesKycPolicy(bvn, String(result.Country || '').toUpperCase()) || !['BVN','BVN_MFA'].includes(String(result.IDType || result.IDInfo?.id_type || '')) || !evidence.identityMatch) throw fail('Your BVN details need review before the next step. Contact support.', 409)
        await mutateDurableJson<RecordState>(storageKey, current => {
          const saved = current?.jobs.find(item => item.id === bvn.id && item.status === 'passed')
          if (!saved) throw fail('Your BVN status changed. Refresh verification.', 409)
          Object.assign(saved, evidence); return current!
        })
      }
    }
    const candidate: Job = action === 'resume' ? latest! : { id: `pkyc_${randomUUID().replaceAll('-', '')}`, userId: smileUserId(identity.userId) + (policy.method === 'bvn' ? '' : '_'+policy.method), environment: config.environment, country: policy.country, provider: policy.provider, policyVersion: policy.policyVersion, status: 'pending', createdAt: Date.now() }
    if (action === 'resume') await mutateDurableJson<RecordState>(storageKey, current => {
      const job = current?.jobs.find(item => item.id === candidate.id)
      if (!job || !publicKyc(job, config.environment).canResume) throw fail('Your verification status changed. Please try again.', 409)
      job.status = 'pending'
      return current!
    })
    if (action === 'start') await mutateDurableJson<RecordState>(storageKey, current => {
      const jobs = current?.jobs || []
      if (jobs.some(job => ['pending', 'review'].includes(job.status)) || completedPair(jobs, config.environment) || policy.method === 'bvn' && approvedBvn(jobs, config.environment)) throw fail('Check your existing verification before starting another.', 409)
      if (jobs.filter(job => Date.now() - job.createdAt < 86400000).length >= 5) throw fail('Daily verification attempt limit reached. Try again tomorrow.', 429)
      if (policy.method !== 'bvn') {
        const bvn = approvedBvn(jobs, config.environment)
        if (!bvn?.identityMatch) throw fail('Complete BVN verification first.', 409)
        candidate.bvnJobId = bvn.id
      }
      return { jobs: [...jobs, candidate] }
    })
    await mutateDurableJson<{ owner: string; environment: SmileEnvironment }>(jobKey(candidate.id), () => ({ owner: identity.userId, environment: config.environment }))
    try {
      const token = await smileRequest(config, 'token', { user_id: candidate.userId, job_id: candidate.id, product: policy.product, callback_url: config.callbackUrl })
      if (typeof token.token !== 'string' || !token.token) throw fail('Smile ID returned an invalid session.', 502)
      return res.json({ ok: true, ...publicFlow((await readDurableJson<RecordState>(storageKey))?.jobs || [candidate], config.environment), token: token.token, partnerId: config.partnerId, callbackUrl: config.callbackUrl })
    } catch (error) {
      // A token request does not submit an identity job. No client received the failed session.
      if (action === 'resume') await mutateDurableJson<RecordState>(storageKey, current => {
      const job = current?.jobs.find(item => item.id === candidate.id)
      if (!job || !publicKyc(job, config.environment).canResume) throw fail('Your verification status changed. Please try again.', 409)
      job.status = 'pending'
      return current!
    })
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

export async function pocketLegacyKycCallback(req: Request, res: Response) {
  try {
    const config = smileConfig()
    const body = req.body || {}
    if (!validSmileSignature(config, body)) return res.status(401).json({ ok: false })
    const params = body.PartnerParams
    if (!/^pkyc_[a-f0-9]{32}$/.test(params?.job_id || '')) return res.status(400).json({ ok: false })
    const index = await readDurableJson<{ owner: string; environment: SmileEnvironment }>(jobKey(params.job_id))
    if (!index || index.environment !== config.environment) return res.status(404).json({ ok: false })
    const record = await readDurableJson<RecordState>(key(index.owner, index.environment))
    const job = record?.jobs.find(item => item.id === params.job_id)
    if (!job || params.user_id !== job.userId || String(params.job_type) !== storedKycPolicy(job).jobType) return res.status(404).json({ ok: false })
    await reconcile(config, index.owner, job)
    return res.json({ ok: true })
  } catch { return res.status(503).json({ ok: false }) }
}

export default async function pocketKyc(req: Request, res: Response) {
  // Keep existing production eligibility and in-flight legacy status reconciliation.
  if (req.body?.action === 'eligibility') return pocketLegacyKyc(req, res)
  if (req.method === 'POST' && ['status', 'uploaded'].includes(req.body?.action)) {
    try {
      const identity = await verifiedPrivyUser(req), config = smileConfig()
      const current = await readDurableJson<{jobs: unknown[]}>('hashpaylink:pocket-kyc:v3:' + config.environment + ':' + createHash('sha256').update(identity.userId).digest('hex'))
      if (!current?.jobs.length) {
        const previous = await readDurableJson<RecordState>(key(identity.userId, config.environment))
        if (completedPair(previous?.jobs || [], config.environment) || previous?.jobs.some(job => ['pending','review'].includes(job.status) && (job.submitted || job.uploadReportedAt))) return pocketLegacyKyc(req, res)
      }
    } catch { /* The V3 handler returns the normal authenticated error response. */ }
  }
  return pocketKycV3(req, res)
}
export async function pocketKycCallback(req: Request,res: Response) {
  if (req.headers['response-signature'] || req.query?.reference) return pocketKycV3Callback(req,res)
  return pocketLegacyKycCallback(req,res)
}
