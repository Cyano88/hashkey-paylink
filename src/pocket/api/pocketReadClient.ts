import type { LocalCurrencyProfile } from '../models/localCurrencyProfile'
import type { PocketActivityRow } from '../models/pocketActivity'
import type { CirclePocketWallets } from '../models/pocketWallet'
import {
  type UnifiedBalanceChainKey,
  type UnifiedBalanceResult,
} from '../../lib/unifiedBalance'
import { CHAIN_META, type ChainKey } from '../../lib/chains'
import { readPocketWallets } from './pocketWalletLinkClient'
import {
  POCKET_API,
  createPocketIdempotencyKey,
  isPocketActivityReadData,
  isPocketBalancesReadData,
  isPocketRecipientBalanceReadData,
  isPocketMutationResult,
  type PocketProfileUpsertData,
} from '../lib/pocketSchemas'

type PocketLocalCurrencyProfileReadInput = {
  accessToken: string
  fetcher?: typeof fetch
}

type PocketLocalCurrencyProfileSaveInput = {
  accessToken: string
  profile: LocalCurrencyProfile
  expectedUpdatedAt?: string
  idempotencyKey?: string
  fetcher?: typeof fetch
}

export type PocketLocalCurrencyProfileReadResult = {
  email: string
  profile: LocalCurrencyProfile | null
}

export type PocketActivityReadResult = {
  payments: PocketActivityRow[]
}

const POCKET_BALANCE_NETWORKS: UnifiedBalanceChainKey[] = ['base', 'arbitrum', 'arc', 'solana']

type PocketRecipientEvmNetwork = Exclude<ChainKey, 'solana'>

type PocketRecipientEvmReader = (input: {
  network: PocketRecipientEvmNetwork
  address: string
}) => Promise<bigint>

async function readPocketRecipientEvmTokenBalance({
  network,
  address,
}: {
  network: PocketRecipientEvmNetwork
  address: string
}): Promise<bigint> {
  const { EVM_CLIENTS, ERC20_BALANCE_OF_ABI } = await import('../../lib/router')
  return EVM_CLIENTS[network].readContract({
    address: CHAIN_META[network].tokenAddress,
    abi: ERC20_BALANCE_OF_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pocketErrorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback
  if (typeof value.error === 'string') return value.error
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return fallback
}

function isLocalCurrencyProfile(value: unknown): value is LocalCurrencyProfile {
  if (!isRecord(value)) return false
  return typeof value.firstName === 'string'
    && typeof value.lastName === 'string'
    && typeof value.email === 'string'
    && (value.updatedAt === undefined || (typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))))
}

export function parsePocketLocalCurrencyProfileRead(value: unknown): PocketLocalCurrencyProfileReadResult {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(pocketErrorMessage(value, 'Profile request failed.'))
  }
  if (value.profile !== null && value.profile !== undefined && !isLocalCurrencyProfile(value.profile)) {
    throw new Error('Profile response was invalid.')
  }
  if (value.email !== undefined && typeof value.email !== 'string') {
    throw new Error('Profile response was invalid.')
  }
  return {
    email: typeof value.email === 'string' ? value.email : '',
    profile: value.profile ?? null,
  }
}

export function parsePocketActivityRead(value: unknown): PocketActivityReadResult {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(pocketErrorMessage(value, 'Could not load Circle Pocket activity.'))
  }
  if (!isPocketActivityReadData(value)) {
    throw new Error('Circle Pocket activity response was invalid.')
  }
  return { payments: value.payments }
}

export function parsePocketLocalCurrencyProfileSave(value: unknown): PocketProfileUpsertData {
  if (!isPocketMutationResult<PocketProfileUpsertData>(value)) {
    throw new Error(pocketErrorMessage(value, 'Profile request failed.'))
  }
  if (!value.ok) throw new Error(value.error?.message ?? 'Profile request failed.')
  if (!value.data || !isLocalCurrencyProfile(value.data.profile) || typeof value.data.unchanged !== 'boolean') {
    throw new Error('Profile response was invalid.')
  }
  return value.data
}

export async function readPocketLocalCurrencyProfile({
  accessToken,
  fetcher = fetch,
}: PocketLocalCurrencyProfileReadInput): Promise<PocketLocalCurrencyProfileReadResult> {
  const response = await fetcher(POCKET_API.profile, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(pocketErrorMessage(data, 'Profile request failed.'))
  }
  return parsePocketLocalCurrencyProfileRead(data)
}

export async function savePocketLocalCurrencyProfile({
  accessToken,
  profile,
  expectedUpdatedAt,
  idempotencyKey = createPocketIdempotencyKey('profile-save'),
  fetcher = fetch,
}: PocketLocalCurrencyProfileSaveInput): Promise<PocketProfileUpsertData> {
  const response = await fetcher(POCKET_API.profile, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(pocketErrorMessage(data, 'Profile request failed.'))
  }
  return parsePocketLocalCurrencyProfileSave(data)
}

export async function readPocketActivity({
  accessToken,
  fetcher = fetch,
}: {
  accessToken: string
  fetcher?: typeof fetch
}): Promise<PocketActivityReadResult> {
  const response = await fetcher(POCKET_API.activity, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(pocketErrorMessage(data, 'Could not load Circle Pocket activity.'))
  }
  return parsePocketActivityRead(data)
}

export async function readPocketBalances({
  accessToken,
  fetcher = fetch,
}: {
  accessToken: string
  fetcher?: typeof fetch
}): Promise<UnifiedBalanceResult> {
  const response = await fetcher(POCKET_API.balances, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(pocketErrorMessage(data, 'Circle Pocket balance refresh failed.'))
  if (!isRecord(data) || data.ok !== true) throw new Error(pocketErrorMessage(data, 'Circle Pocket balance refresh failed.'))
  if (!isPocketBalancesReadData(data)) throw new Error('Circle Pocket balance response was invalid.')
  return { total: data.total, rows: data.rows }
}

export async function readPocketLinkedWallets({
  accessToken,
  reader = readPocketWallets,
}: {
  accessToken: string
  reader?: typeof readPocketWallets
}): Promise<CirclePocketWallets> {
  const result = await reader({ accessToken })
  return POCKET_BALANCE_NETWORKS.reduce<CirclePocketWallets>((wallets, network) => {
    const link = result.wallets[network]
    if (link) wallets[network] = {
      address: link.wallet.address,
      walletId: link.wallet.id,
      blockchain: link.wallet.blockchain,
      updatedAt: link.updatedAt,
    }
    return wallets
  }, {})
}

export async function readPocketRecipientBalance({
  network,
  address,
  fetcher = fetch,
  evmReader = readPocketRecipientEvmTokenBalance,
}: {
  network: ChainKey
  address: string
  fetcher?: typeof fetch
  evmReader?: PocketRecipientEvmReader
}): Promise<number> {
  if (network === 'solana') {
    const response = await fetcher(POCKET_API.recipientBalance, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ network, address }),
    })
    const data = await response.json().catch(() => undefined)
    if (!response.ok || !isRecord(data) || data.ok !== true || !isPocketRecipientBalanceReadData(data)) {
      throw new Error(pocketErrorMessage(data, 'Balance unavailable'))
    }
    return Number(BigInt(data.balance)) / 1_000_000
  }

  const raw = await evmReader({ network, address })
  return Number(raw) / 10 ** CHAIN_META[network].decimals
}
