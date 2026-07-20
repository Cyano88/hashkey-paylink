import type { Request, Response } from 'express'
import { createVtpassClient } from '../vtpass-client.js'
import { readVtpassPhase0Config } from '../vtpass-config.js'
import { createPocketBillsStore, PocketBillsStoreError } from './bills-store.js'

type BillsStore = ReturnType<typeof createPocketBillsStore>
type Provider = Pick<ReturnType<typeof createVtpassClient>, 'requeryTransaction'>

type VtpassWebhookDependencies = {
  store: BillsStore
  provider: Provider
  enabled: boolean
  log?: (message: string, details?: Record<string, unknown>) => void
}

const REQUEST_ID_PATTERN = /^\d{12}[a-zA-Z0-9]{0,40}$/

function clean(value: unknown, max = 100) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function callbackRequestId(body: unknown) {
  if (!body || typeof body !== 'object') return ''
  const root = body as Record<string, unknown>
  if (clean(root.type, 40).toLowerCase() !== 'transaction-update') return ''
  const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : undefined
  const requestId = clean(data?.requestId ?? data?.request_id, 60)
  return REQUEST_ID_PATTERN.test(requestId) ? requestId : ''
}

function acknowledge(res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({ response: 'success' })
}

export function createVtpassBillsWebhookHandler(dependencies: VtpassWebhookDependencies) {
  return async function vtpassBillsWebhookHandler(req: Request, res: Response) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return res.status(405).json({ response: 'method not allowed' })
    }

    const requestId = callbackRequestId(req.body)
    if (!dependencies.enabled || !requestId) return acknowledge(res)

    let claimed = false
    try {
      await dependencies.store.consumeMutationLimit({
        ownerId: 'system:vtpass-webhook',
        action: 'webhook:signal',
        windowMs: 60_000,
        max: 120,
      })
      const claim = await dependencies.store.claimProviderRequeryByRequestId({ requestId })
      if (!claim.claimed || !claim.intent) return acknowledge(res)
      claimed = true

      try {
        await dependencies.store.consumeMutationLimit({
          ownerId: claim.intent.ownerId,
          action: 'provider:webhook',
          windowMs: 60_000,
          max: 20,
        })
      } catch (error) {
        if (error instanceof PocketBillsStoreError && error.code === 'BILLS_RATE_LIMITED') {
          return acknowledge(res)
        }
        throw error
      }

      try {
        const result = await dependencies.provider.requeryTransaction(requestId)
        await dependencies.store.recordProviderResult(claim.intent.ownerId, claim.intent.id, result, { requery: true })
      } catch (error) {
        try {
          if (error instanceof PocketBillsStoreError && error.code === 'BILLS_PROVIDER_MISMATCH') {
            await dependencies.store.markNeedsReview(claim.intent.ownerId, claim.intent.id, error.message)
          } else {
            await dependencies.store.recordRequeryFailure(
              claim.intent.ownerId,
              claim.intent.id,
              error instanceof Error ? error.message : 'VTpass status requery failed.',
            )
          }
        } catch {
          // A concurrent owner action may have moved the intent to a protected
          // refund state. The callback is only a wake-up signal, so it must not
          // override that state or make the provider payload authoritative.
        }
        dependencies.log?.('[pocket-bills-webhook] authenticated requery failed', {
          requestId,
          name: error instanceof Error ? error.name : 'Error',
        })
      }
    } catch (error) {
      dependencies.log?.('[pocket-bills-webhook] callback ignored', {
        requestId,
        name: error instanceof Error ? error.name : 'Error',
      })
    } finally {
      if (claimed) {
        try {
          await dependencies.store.releaseProviderRequeryClaim(requestId)
        } catch {
          // The short durable lease expires safely even if storage is
          // temporarily unavailable while releasing it.
        }
      }
    }

    return acknowledge(res)
  }
}

function defaultDependencies(): VtpassWebhookDependencies {
  const config = readVtpassPhase0Config()
  return {
    store: createPocketBillsStore({ config }),
    provider: createVtpassClient({ config }),
    enabled: config.enabled && (config.canSandboxVend || config.canLiveVend),
    log: (message, details) => console.warn(message, details),
  }
}

export default createVtpassBillsWebhookHandler(defaultDependencies())
