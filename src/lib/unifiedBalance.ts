import {
  createUnifiedBalanceKitContext,
  getBalances,
} from '@circle-fin/unified-balance-kit'
import type {
  GetBalancesResult,
  UnifiedBalanceChainIdentifier,
} from '@circle-fin/unified-balance-kit'

export type UnifiedBalanceChainKey = 'base' | 'arc' | 'arbitrum' | 'solana'

export interface UnifiedBalanceBreakdown {
  key: UnifiedBalanceChainKey
  label: string
  balance: number
  status: 'ok' | 'unsupported' | 'error'
  error?: string
}

export interface UnifiedBalanceQuery {
  evmAddress?: string
  solanaAddress?: string
  chains: UnifiedBalanceChainKey[]
}

export interface UnifiedBalanceResult {
  total: number
  rows: UnifiedBalanceBreakdown[]
}

const context = createUnifiedBalanceKitContext()

const CIRCLE_CHAIN_BY_KEY: Partial<Record<UnifiedBalanceChainKey, UnifiedBalanceChainIdentifier>> = {
  base: 'Base',
  arc: 'Arc_Testnet',
  arbitrum: 'Arbitrum',
  solana: 'Solana',
}

const LABEL_BY_KEY: Record<UnifiedBalanceChainKey, string> = {
  base: 'Base',
  arc: 'Arc',
  arbitrum: 'Arbitrum',
  solana: 'Solana',
}

const BALANCE_TIMEOUT_MS = 10_000

function timeoutError(label: string) {
  return new Error(`${label} balance lookup timed out`)
}

async function withTimeout<T>(promise: Promise<T>, label: string, timeoutMs = BALANCE_TIMEOUT_MS): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(timeoutError(label)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
  }
}

async function fetchJsonWithTimeout<T>(input: RequestInfo | URL, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), BALANCE_TIMEOUT_MS)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw timeoutError(label)
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

function asNumber(value: string | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function emptyRows(chains: UnifiedBalanceChainKey[]): UnifiedBalanceBreakdown[] {
  return chains.map(key => ({
    key,
    label: LABEL_BY_KEY[key],
    balance: 0,
    status: 'ok',
  }))
}

function amountForCircleChain(result: GetBalancesResult, circleChain: UnifiedBalanceChainIdentifier): number {
  let amount = 0
  for (const account of result.breakdown) {
    for (const chain of account.breakdown) {
      if (chain.chain === circleChain) amount += asNumber(chain.confirmedBalance)
    }
  }
  return amount
}

function updateRow(
  rows: UnifiedBalanceBreakdown[],
  key: UnifiedBalanceChainKey,
  patch: Partial<Omit<UnifiedBalanceBreakdown, 'key' | 'label'>>,
) {
  return rows.map(row => {
    if (row.key !== key) return row
    return { ...row, ...patch }
  })
}

async function queryCircleBalance(address: string, chain: UnifiedBalanceChainIdentifier): Promise<number> {
  const result = await withTimeout(getBalances(context, {
    token: 'USDC',
    sources: { address, chains: chain },
    includePending: false,
  }), `${chain} Circle`)
  return amountForCircleChain(result, chain)
}

async function queryEvmTokenBalance(key: 'base' | 'arc' | 'arbitrum', address: string): Promise<number> {
  const response = await fetchJsonWithTimeout('/api/evm-balance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chain: key, address }),
  }, LABEL_BY_KEY[key])
  const data = await response.json() as { ok?: boolean; balance?: string; error?: string }
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'EVM balance query failed')
  return asNumber(data.balance)
}

async function querySolanaWalletBalance(address: string): Promise<number> {
  const response = await fetchJsonWithTimeout('/api/solana-balance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountAddress: address }),
  }, 'Solana')
  const data = await response.json() as { ok?: boolean; balance?: string; error?: string }
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'Solana balance query failed')
  return Number(BigInt(data.balance ?? '0')) / 1_000_000
}

export async function queryBalances(query: UnifiedBalanceQuery): Promise<UnifiedBalanceResult> {
  const selected = Array.from(new Set(query.chains))
  let rows = emptyRows(selected)

  for (const key of selected) {
    const address = key === 'solana' ? query.solanaAddress : query.evmAddress
    if (!address) continue
    try {
      const balance = key === 'solana'
        ? await querySolanaWalletBalance(address)
        : await queryEvmTokenBalance(key, address)
      rows = updateRow(rows, key, { balance, status: 'ok', error: undefined })
    } catch (error) {
      const circleChain = CIRCLE_CHAIN_BY_KEY[key]
      if (!circleChain) {
        rows = updateRow(rows, key, {
          balance: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Balance query failed',
        })
        continue
      }

      try {
        const balance = await queryCircleBalance(address, circleChain)
        if (balance <= 0) throw error
        rows = updateRow(rows, key, { balance, status: 'ok', error: undefined })
      } catch {
        rows = updateRow(rows, key, {
          balance: 0,
          status: 'error',
          error: error instanceof Error ? error.message : 'Balance query failed',
        })
      }
    }
  }

  return {
    total: rows.reduce((sum, row) => sum + row.balance, 0),
    rows,
  }
}
