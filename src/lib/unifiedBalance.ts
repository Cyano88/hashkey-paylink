import {
  createUnifiedBalanceKitContext,
  getBalances,
} from '@circle-fin/unified-balance-kit'
import type {
  GetBalancesResult,
  UnifiedBalanceChainIdentifier,
} from '@circle-fin/unified-balance-kit'

export type UnifiedBalanceChainKey = 'base' | 'arc' | 'arbitrum' | 'solana' | 'starknet'

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
  starknetAddress?: string
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
  starknet: 'Starknet',
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
  const result = await getBalances(context, {
    token: 'USDC',
    sources: { address, chains: chain },
    includePending: false,
  })
  return amountForCircleChain(result, chain)
}

async function queryStarknetBalance(address: string): Promise<number> {
  const response = await fetch('/api/starknet-balance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accountAddress: address }),
  })
  const data = await response.json() as { ok?: boolean; balance?: string; error?: string }
  if (!response.ok || !data.ok) throw new Error(data.error ?? 'Starknet balance query failed')
  return Number(BigInt(data.balance ?? '0x0')) / 1_000_000
}

export async function queryBalances(query: UnifiedBalanceQuery): Promise<UnifiedBalanceResult> {
  const selected = Array.from(new Set(query.chains))
  let rows = emptyRows(selected)

  for (const key of selected) {
    const circleChain = CIRCLE_CHAIN_BY_KEY[key]
    if (!circleChain) continue
    const address = key === 'solana' ? query.solanaAddress : query.evmAddress
    if (!address) continue
    try {
      const balance = await queryCircleBalance(address, circleChain)
      rows = updateRow(rows, key, { balance, status: 'ok', error: undefined })
    } catch (error) {
      rows = updateRow(rows, key, {
        balance: 0,
        status: 'error',
        error: error instanceof Error ? error.message : 'Circle balance query failed',
      })
    }
  }

  if (query.starknetAddress && selected.includes('starknet')) {
    try {
      const balance = await queryStarknetBalance(query.starknetAddress)
      rows = updateRow(rows, 'starknet', { balance, status: 'ok', error: undefined })
    } catch (error) {
      rows = updateRow(rows, 'starknet', {
        status: 'error',
        error: error instanceof Error ? error.message : 'Starknet balance query failed',
      })
    }
  }

  return {
    total: rows.reduce((sum, row) => sum + row.balance, 0),
    rows,
  }
}
