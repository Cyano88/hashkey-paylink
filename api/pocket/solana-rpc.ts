import type { Request, Response } from 'express'
import { verifiedPrivyUser, type VerifiedLinkUser } from '../privy-circle-link.js'

const ALLOWED_METHODS = new Set([
  'getAccountInfo',
  'getBalance',
  'getBlockHeight',
  'getEpochInfo',
  'getFeeForMessage',
  'getGenesisHash',
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
  now(): number
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

const WINDOW_MS = 60_000
const MAX_USERS = 10_000
const MAX_REQUEST_BYTES = 64 * 1024
const TRANSACTION_METHODS = new Set(['sendTransaction', 'simulateTransaction'])
type Budget = { resetAt: number; reads: number; transactions: number; active: number }

export function createPocketSolanaRpcHandler(overrides: Partial<Dependencies> = {}) {
  const dependencies: Dependencies = { verifyUser: verifiedPrivyUser, fetcher: fetch, rpcUrl, now: Date.now, ...overrides }
  const budgets = new Map<string, Budget>()
  return async function pocketSolanaRpcHandler(req: Request, res: Response) {
    if (req.method !== 'POST') return res.status(405).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Method not allowed.' } })
    let reserved: Budget | undefined
    try {
      const user = await dependencies.verifyUser(req)
      if (!user.userId) return res.status(401).json({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in again to use the Solana network.' } })
      const requests = rpcRequests(req.body)
      if (!requests) return res.status(400).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Solana RPC request.' } })
      const payload = JSON.stringify(req.body)
      if (Buffer.byteLength(payload, 'utf8') > MAX_REQUEST_BYTES) return res.status(413).json({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Solana RPC request is too large.' } })
      const endpoint = dependencies.rpcUrl()
      if (!/^https:\/\//i.test(endpoint)) throw new Error('Pocket Solana RPC is not configured.')
      const now = dependencies.now()
      let budget = budgets.get(user.userId)
      if (!budget) {
        if (budgets.size >= MAX_USERS) {
          for (const [key, value] of budgets) if (value.resetAt <= now && value.active === 0) budgets.delete(key)
        }
        if (budgets.size >= MAX_USERS) return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Pocket Solana network is temporarily unavailable.' } })
        budget = { resetAt: now + WINDOW_MS, reads: 0, transactions: 0, active: 0 }
        budgets.set(user.userId, budget)
      }
      if (budget.resetAt <= now) { budget.resetAt = now + WINDOW_MS; budget.reads = 0; budget.transactions = 0 }
      const transactions = requests.filter(request => TRANSACTION_METHODS.has(request.method)).length
      const reads = requests.length - transactions
      if (budget.reads + reads > 120 || budget.transactions + transactions > 20 || budget.active >= 4) {
        res.setHeader('Retry-After', String(budget.active >= 4 ? 1 : Math.max(1, Math.ceil((budget.resetAt - now) / 1000))))
        return res.status(429).json({ jsonrpc: '2.0', id: null, error: { code: -32005, message: 'Too many Solana requests. Try again shortly.' } })
      }
      budget.reads += reads
      budget.transactions += transactions
      budget.active += 1
      reserved = budget
      const upstream = await dependencies.fetcher(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        signal: AbortSignal.timeout(25_000),
      })
      const body = await upstream.text()
      if (!upstream.ok) {
        console.warn('[pocket-solana-rpc] provider rejected request', { status: upstream.status })
        return res.status(503).json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Pocket Solana network is temporarily unavailable.' } })
      }
      res.status(200).type('application/json').send(body)
    } catch (reason) {
      const status = Number((reason as { status?: number }).status) === 401 ? 401 : 503
      return res.status(status).json({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: status === 401 ? -32001 : -32000,
          message: status === 401 ? 'Sign in again to use the Solana network.' : 'Pocket Solana network is temporarily unavailable.',
        },
      })
    } finally {
      if (reserved) reserved.active -= 1
    }
  }
}

export default createPocketSolanaRpcHandler()
