import type { Request, Response } from 'express'
import {
  createUnifiedBalanceKitContext,
  getBalances,
} from '@circle-fin/unified-balance-kit'
import type {
  GetBalancesResult,
  UnifiedBalanceChainIdentifier,
} from '@circle-fin/unified-balance-kit'
import {
  circleLinkKey,
  readCircleLink,
  verifiedPrivyUser,
  type CircleLinkRecord,
  type VerifiedLinkUser,
} from '../privy-circle-link.js'
import { readEvmUsdcBalance } from '../evm-balance.js'
import { readSolanaUsdcBalance } from '../solana-balance.js'
import {
  POCKET_NETWORKS,
  type PocketBalanceRow,
  type PocketErrorCode,
  type PocketNetwork,
} from '../../src/pocket/lib/pocketSchemas.js'

type PocketBalancesHandlerDependencies = {
  verifyUser(req: Request): Promise<VerifiedLinkUser>
  readLink(key: string): Promise<CircleLinkRecord | null>
  readBalance(network: PocketNetwork, address: string): Promise<number>
}

const LABELS: Record<PocketNetwork, string> = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  arc: 'Arc',
  solana: 'Solana',
}

const CIRCLE_CHAINS: Record<PocketNetwork, UnifiedBalanceChainIdentifier> = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  arc: 'Arc_Testnet',
  solana: 'Solana',
}

const BALANCE_TIMEOUT_MS = 10_000
const circleContext = createUnifiedBalanceKitContext()

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} balance lookup timed out`)), BALANCE_TIMEOUT_MS)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

function circleAmount(result: GetBalancesResult, chain: UnifiedBalanceChainIdentifier) {
  let amount = 0
  for (const account of result.breakdown) {
    for (const row of account.breakdown) {
      if (row.chain === chain) {
        const parsed = Number.parseFloat(row.confirmedBalance ?? '0')
        if (Number.isFinite(parsed)) amount += parsed
      }
    }
  }
  return amount
}

async function readCircleFallback(network: PocketNetwork, address: string) {
  const chain = CIRCLE_CHAINS[network]
  const result = await withTimeout(getBalances(circleContext, {
    token: 'USDC',
    sources: { address, chains: chain },
    includePending: false,
  }), `${LABELS[network]} Circle`)
  return circleAmount(result, chain)
}

export async function readPocketNetworkBalance(network: PocketNetwork, address: string) {
  try {
    if (network === 'solana') {
      const result = await withTimeout(readSolanaUsdcBalance(address), LABELS[network])
      return Number(result.balance) / 1_000_000
    }
    return await withTimeout(readEvmUsdcBalance(network, address as `0x${string}`), LABELS[network])
  } catch (directError) {
    try {
      const fallback = await readCircleFallback(network, address)
      if (fallback > 0) return fallback
    } catch {
      // Preserve the direct reader failure just like the existing browser balance boundary.
    }
    throw directError
  }
}

export function createPocketBalancesHandler(dependencies: PocketBalancesHandlerDependencies) {
  return async function pocketBalancesHandler(req: Request, res: Response) {
    function fail(status: number, code: PocketErrorCode, message: string, retryable: boolean) {
      return res.status(status).json({ ok: false, error: { code, message, retryable } })
    }

    if (req.method !== 'GET') return fail(405, 'VALIDATION_FAILED', 'Method not allowed.', false)

    try {
      const identity = await dependencies.verifyUser(req)
      const rows: PocketBalanceRow[] = []
      for (const network of POCKET_NETWORKS) {
        const link = await dependencies.readLink(circleLinkKey(identity.userId, network, 'payment'))
        if (!link) {
          rows.push({ key: network, label: LABELS[network], balance: 0, status: 'ok' })
          continue
        }
        if (link.chain !== network || (link.purpose ?? 'payment') !== 'payment') {
          throw Object.assign(new Error('Stored Circle wallet link did not match its payment network.'), { status: 500 })
        }
        try {
          const balance = await dependencies.readBalance(network, link.circleWalletAddress)
          if (!Number.isFinite(balance) || balance < 0) throw new Error('Balance reader returned an invalid amount.')
          rows.push({ key: network, label: LABELS[network], balance, status: 'ok' })
        } catch {
          rows.push({
            key: network,
            label: LABELS[network],
            balance: 0,
            status: 'error',
            error: `${LABELS[network]} balance is temporarily unavailable.`,
          })
        }
      }
      const mainnetTotal = rows.reduce((sum, row) => row.key === 'arc' ? sum : sum + row.balance, 0)
      return res.json({ ok: true, total: mainnetTotal, rows })
    } catch (error) {
      const normalized = error as Error & { status?: number }
      if (normalized.status === 401) return fail(401, 'AUTH_REQUIRED', normalized.message, false)
      if (normalized.status === 403) return fail(403, 'FORBIDDEN', normalized.message, false)
      if (normalized.status === 429) return fail(429, 'RATE_LIMITED', normalized.message, true)
      if ((normalized.status ?? 0) >= 500) return fail(503, 'PROVIDER_UNAVAILABLE', normalized.message, true)
      return fail(500, 'INTERNAL_ERROR', normalized.message || 'Circle Pocket balance read failed.', true)
    }
  }
}

export default createPocketBalancesHandler({
  verifyUser: verifiedPrivyUser,
  readLink: readCircleLink,
  readBalance: readPocketNetworkBalance,
})
