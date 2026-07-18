import type { Request, Response } from 'express'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'

const ALLOWED_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getLatestBlockhash',
  'getMinimumBalanceForRentExemption',
  'getMultipleAccounts',
  'getRecentPrioritizationFees',
  'getSignatureStatuses',
  'getSlot',
  'getTokenAccountBalance',
  'getTransaction',
  'isBlockhashValid',
  'sendTransaction',
  'simulateTransaction',
])

type Dependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  fetcher: typeof fetch
  rpcUrl(): string
}

function rpcUrl() {
  return String(process.env.SOLANA_RPC_URL ?? '').trim()
}

function rpcRequests(value: unknown) {
  const requests = Array.isArray(value) ? value : [value]
  if (!requests.length || requests.length > 20) return null
  for (const request of requests) {
    if (!request || typeof request !== 'object' || Array.isArray(request)) return null
    const item = request as Record<string, unknown>
    if (item.jsonrpc !== '2.0' || !ALLOWED_METHODS.has(String(item.method ?? ''))) return null
    if (item.params !== undefined && !Array.isArray(item.params) && (typeof item.params !== 'object' || item.params === null)) return null
  }
  return requests
}

export function createPocketSolanaRpcHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { verifyUser: verifiedPrivyUser, fetcher: fetch, rpcUrl, ...overrides }
  return async function pocketSolanaRpcHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method not allowed.' } })
    try {
      await dependencies.verifyUser(req)
      const requests = rpcRequests(req.body)
      if (!requests) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Solana RPC request.' } })
      const endpoint = dependencies.rpcUrl()
      if (!/^https:\/\//i.test(endpoint)) throw new Error('Pocket Solana RPC is not configured.')
      const upstream = await dependencies.fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req.body),
        signal: AbortSignal.timeout(25_000),
      })
      const body = await upstream.text()
      if (!upstream.ok) {
        console.warn('[pocket-solana-rpc] provider rejected request', { status: upstream.status })
        return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Pocket Solana network is temporarily unavailable.' } })
      }
      res.status(200).type('application/json').send(body)
    } catch (reason) {
      const status = Number((reason as { status?: number }).status) || 503
      return res.status(status).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: status === 401 ? -32001 : -32000,
          message: status === 401 ? 'Sign in again to use the Solana network.' : reason instanceof Error ? reason.message : 'Pocket Solana network is temporarily unavailable.',
        },
      })
    }
  }
}

export default createPocketSolanaRpcHandler()
