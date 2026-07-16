import type { Request, Response } from 'express'
import {
  buildSolanaTx,
  relaySolanaTx,
  validatePocketSignedSolanaTransaction,
} from '../relay-solana.js'
import {
  circleLinkKey,
  readCircleLink,
  verifiedPrivyUser,
  type CircleLinkRecord,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import {
  isPocketSolanaTransferPrepareData,
  isPocketSolanaTransferPrepareRequest,
  isPocketSolanaTransferSubmitData,
  isPocketSolanaTransferSubmitRequest,
  type PocketErrorCode,
} from '../../src/pocket/lib/pocketSchemas.js'

type LegacyHandler = (req: Request, res: Response) => Promise<void>
type LegacyResult = { status: number; body: unknown }

type PocketSolanaTransferDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): Promise<CircleLinkRecord | null>
  build: LegacyHandler
  relay: LegacyHandler
  validateSigned(input: { tx: string; requiredSigner: string }): void
}

async function invokeLegacy(handler: LegacyHandler, req: Request, body: Record<string, unknown>): Promise<LegacyResult> {
  let status = 200
  let responseBody: unknown
  const response = {
    status(code: number) { status = code; return this },
    json(value: unknown) { responseBody = value; return this },
  } as unknown as Response
  await handler({ ...req, body } as Request, response)
  if (responseBody === undefined) throw Object.assign(new Error('Solana relay returned no response.'), { status: 502 })
  return { status, body: responseBody }
}

function legacyMessage(value: unknown, fallback: string) {
  if (value && typeof value === 'object' && typeof (value as { error?: unknown }).error === 'string') {
    return (value as { error: string }).error
  }
  return fallback
}

async function linkedSolanaWallet(dependencies: PocketSolanaTransferDependencies, req: Request) {
  const identity = await dependencies.verifyUser(req)
  const link = await dependencies.readLink(circleLinkKey(identity.userId, 'solana', 'payment'))
  if (!link) throw Object.assign(new Error('Link a Circle Solana wallet before withdrawing.'), { status: 404 })
  if (link.chain !== 'solana' || (link.purpose ?? 'payment') !== 'payment') {
    throw Object.assign(new Error('Stored Circle wallet link did not match the Solana payment wallet.'), { status: 500 })
  }
  return link.circleWalletAddress
}

function sendFailure(res: Response, status: number, code: PocketErrorCode, message: string, retryable: boolean, field?: string) {
  return res.status(status).json({
    ok: false,
    error: { code, message, retryable, ...(field ? { field } : {}) },
  })
}

function mappedFailure(res: Response, error: Error & { status?: number }, fallback: string) {
  if (error.status === 400) return sendFailure(res, 400, 'VALIDATION_FAILED', error.message, false)
  if (error.status === 401) return sendFailure(res, 401, 'AUTH_REQUIRED', error.message, false)
  if (error.status === 403) return sendFailure(res, 403, 'FORBIDDEN', error.message, false)
  if (error.status === 404) return sendFailure(res, 404, 'RESOURCE_NOT_FOUND', error.message, false)
  if (error.status === 429) return sendFailure(res, 429, 'RATE_LIMITED', error.message, true)
  if ((error.status ?? 0) >= 500) return sendFailure(res, 503, 'PROVIDER_UNAVAILABLE', error.message, true)
  return sendFailure(res, 500, 'ACTION_FAILED', error.message || fallback, true)
}

export function createPocketSolanaTransferPrepareHandler(dependencies: PocketSolanaTransferDependencies) {
  return async function pocketSolanaTransferPrepareHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return sendFailure(res, 405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    try {
      if (!isPocketSolanaTransferPrepareRequest(req.body)) {
        return sendFailure(res, 400, 'VALIDATION_FAILED', 'Enter a valid Solana recipient and USDC amount.', false, 'transfer')
      }
      const sender = await linkedSolanaWallet(dependencies, req)
      const legacy = await invokeLegacy(dependencies.build, req, {
        from: sender,
        to: req.body.recipient,
        amount: req.body.amount,
        mode: 'withdraw',
      })
      if (legacy.status < 200 || legacy.status >= 300) {
        throw Object.assign(new Error(legacyMessage(legacy.body, 'Failed to prepare Solana withdrawal.')), { status: legacy.status })
      }
      const body = legacy.body as { tx?: unknown; lastValidBlockHeight?: unknown }
      const data = { transaction: body.tx, lastValidBlockHeight: body.lastValidBlockHeight }
      if (!isPocketSolanaTransferPrepareData(data)) {
        throw Object.assign(new Error('Solana builder returned an invalid transaction.'), { status: 502 })
      }
      return res.json({ ok: true, ...data })
    } catch (error) {
      return mappedFailure(res, error as Error & { status?: number }, 'Failed to prepare Solana withdrawal.')
    }
  }
}

export function createPocketSolanaTransferSubmitHandler(dependencies: PocketSolanaTransferDependencies) {
  return async function pocketSolanaTransferSubmitHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return sendFailure(res, 405, 'VALIDATION_FAILED', 'Method not allowed.', false)
    try {
      if (!isPocketSolanaTransferSubmitRequest(req.body)) {
        return sendFailure(res, 400, 'VALIDATION_FAILED', 'Enter a valid signed Solana transaction.', false, 'transaction')
      }
      const linkedWallet = await linkedSolanaWallet(dependencies, req)
      dependencies.validateSigned({ tx: req.body.transaction, requiredSigner: linkedWallet })
      const legacy = await invokeLegacy(dependencies.relay, req, {
        tx: req.body.transaction,
        lastValidBlockHeight: req.body.lastValidBlockHeight,
      })
      if (legacy.status < 200 || legacy.status >= 300) {
        throw Object.assign(new Error(legacyMessage(legacy.body, 'Solana relay failed.')), { status: legacy.status })
      }
      const body = legacy.body as { txHash?: unknown; status?: unknown; warning?: unknown }
      const data = { txHash: body.txHash, status: body.status, ...(body.warning !== undefined ? { warning: body.warning } : {}) }
      if (!isPocketSolanaTransferSubmitData(data)) {
        throw Object.assign(new Error('Solana relay returned an invalid result.'), { status: 502 })
      }
      return res.json({ ok: true, ...data })
    } catch (error) {
      return mappedFailure(res, error as Error & { status?: number }, 'Solana relay failed.')
    }
  }
}

const dependencies: PocketSolanaTransferDependencies = {
  verifyUser: verifiedPrivyUser,
  readLink: readCircleLink,
  build: buildSolanaTx,
  relay: relaySolanaTx,
  validateSigned: validatePocketSignedSolanaTransaction,
}

export const pocketSolanaTransferPrepareHandler = createPocketSolanaTransferPrepareHandler(dependencies)
export const pocketSolanaTransferSubmitHandler = createPocketSolanaTransferSubmitHandler(dependencies)
