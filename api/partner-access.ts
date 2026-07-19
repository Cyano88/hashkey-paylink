import { randomUUID } from 'crypto'
import type { Request, Response } from 'express'
import { hasRenderDurableStore, mutateDurableJson } from './render-durable-store.js'

const STORE_KEY = (process.env.PARTNER_ACCESS_STORE_KEY ?? 'hashpaylink:partner-access-requests').trim()
const ALLOWED_PRODUCTS = new Set(['hosted-checkout', 'api-services', 'pos', 'bank-requests'])

type PartnerAccessRequest = {
  id: string
  name: string
  email: string
  company: string
  website: string
  product: string
  useCase: string
  createdAt: string
  status: 'requested'
}

type PartnerAccessStore = {
  requests: PartnerAccessRequest[]
}

function clean(value: unknown, max: number) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function validWebsite(value: string) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

type PartnerAccessDependencies = {
  hasStore: () => boolean
  mutate: (key: string, update: (current: PartnerAccessStore | undefined) => PartnerAccessStore) => Promise<PartnerAccessStore>
  createId: () => string
  now: () => Date
}

const defaultDependencies: PartnerAccessDependencies = {
  hasStore: hasRenderDurableStore,
  mutate: (key, update) => mutateDurableJson<PartnerAccessStore>(key, update),
  createId: () => `partner_${randomUUID().replace(/-/g, '').slice(0, 16)}`,
  now: () => new Date(),
}

export function createPartnerAccessHandler(dependencies: PartnerAccessDependencies = defaultDependencies) {
  return async function partnerAccessHandler(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store')
    try {
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed.' })

    // Hidden bot field. Return a neutral success response without storing it.
    if (clean(req.body?.fax, 80)) return res.json({ ok: true, requestId: 'received' })

    const name = clean(req.body?.name, 80)
    const email = clean(req.body?.email, 160).toLowerCase()
    const company = clean(req.body?.company, 100)
    const website = clean(req.body?.website, 240)
    const product = clean(req.body?.product, 40).toLowerCase()
    const useCase = clean(req.body?.useCase, 800)

    if (name.length < 2) return res.status(400).json({ ok: false, error: 'Enter your name.' })
    if (!validEmail(email)) return res.status(400).json({ ok: false, error: 'Enter a valid work email.' })
    if (company.length < 2) return res.status(400).json({ ok: false, error: 'Enter your company or project name.' })
    if (!validWebsite(website)) return res.status(400).json({ ok: false, error: 'Enter a valid website URL.' })
    if (!ALLOWED_PRODUCTS.has(product)) return res.status(400).json({ ok: false, error: 'Choose a checkout product.' })
    if (useCase.length < 20) return res.status(400).json({ ok: false, error: 'Briefly describe what you want to sell or collect payment for.' })
    if (!dependencies.hasStore()) return res.status(503).json({ ok: false, error: 'Partner requests are temporarily unavailable. Email support@hashpaylink.com.' })

    const request: PartnerAccessRequest = {
      id: dependencies.createId(),
      name,
      email,
      company,
      website,
      product,
      useCase,
      createdAt: dependencies.now().toISOString(),
      status: 'requested',
    }

    await dependencies.mutate(STORE_KEY, current => ({
      requests: [...(current?.requests ?? []), request].slice(-2_000),
    }))

    return res.status(201).json({ ok: true, requestId: request.id })
    } catch (error) {
      console.error('[partner-access] request failed:', error instanceof Error ? error.message : String(error))
      return res.status(503).json({ ok: false, error: 'Partner requests are temporarily unavailable. Email support@hashpaylink.com.' })
    }
  }
}

export default createPartnerAccessHandler()
