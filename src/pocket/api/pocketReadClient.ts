import { isPocketId, normalizePocketId } from '../lib/pocketId'
import { parsePocketWalletUpdateNotice } from '../lib/pocketWalletUpdate'
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
  type PocketPosResource,
  type PocketCollectionResource,
} from '../lib/pocketSchemas'

type PocketLocalCurrencyProfileReadInput = {
  accessToken: string
  fetcher?: typeof fetch
}

type PocketLocalCurrencyProfileSaveInput = {
  accessToken: string
  pocketId: string
  avatarId?: number
  displayCurrency?: LocalCurrencyProfile['displayCurrency']
  expectedUpdatedAt?: string
  idempotencyKey?: string
  fetcher?: typeof fetch
}

export type PocketLocalCurrencyProfileReadResult = {
  email: string
  profile: LocalCurrencyProfile | null
}

export type PocketActivityReadResult = {
  groupedTransactionHashes?: string[]
  archivedKeys?: string[]
  complete?: boolean
  partial?: boolean
  refreshing?: boolean
  updatedAt?: number
  payments: PocketActivityRow[]
  merchants: PocketPosResource[]
  collections: PocketCollectionResource[]
}

const POCKET_BALANCE_NETWORKS: UnifiedBalanceChainKey[] = ['base', 'arbitrum', 'arc', 'solana', 'ethereum', 'polygon']

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

type CompatibleLocalCurrencyProfile = Omit<LocalCurrencyProfile, 'displayCurrency'> & { displayCurrency?: LocalCurrencyProfile['displayCurrency'] }

function isLocalCurrencyProfile(value: unknown): value is CompatibleLocalCurrencyProfile {
  if (!isRecord(value)) return false
  return typeof value.firstName === 'string'
    && typeof value.lastName === 'string'
    && typeof value.resolvedName === 'string'
    && (value.nameStatus === 'unverified' || value.nameStatus === 'bank_resolved' || value.nameStatus === 'kyc_verified')
    && typeof value.email === 'string'
    && typeof value.pocketNumber === 'string'
    && /^\d{6,12}$/.test(value.pocketNumber)
    && typeof value.pocketId === 'string'
    && isPocketId(value.pocketId)
    && Number.isInteger(value.avatarId)
    && Number(value.avatarId) >= 1
    && Number(value.avatarId) <= 4
    && (value.displayCurrency === undefined || value.displayCurrency === 'USDC' || value.displayCurrency === 'NGN' || value.displayCurrency === 'UGX' || value.displayCurrency === 'GHS' || value.displayCurrency === 'KES')
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
    profile: value.profile ? { ...value.profile, displayCurrency: value.profile.displayCurrency === 'NGN' || value.profile.displayCurrency === 'UGX' ? value.profile.displayCurrency : 'USDC' } : null,
  }
}

export function parsePocketActivityRead(value: unknown): PocketActivityReadResult {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(pocketErrorMessage(value, 'Could not load Circle Pocket activity.'))
  }
  if (!isPocketActivityReadData(value)) {
    throw new Error('Circle Pocket activity response was invalid.')
  }
  return { payments: value.payments, merchants: value.merchants, collections: value.collections, archivedKeys:value.archivedKeys || [],
    groupedTransactionHashes: value.groupedTransactionHashes,
    ...(typeof value.complete === 'boolean' ? { complete: value.complete } : {}),
    ...(typeof value.partial === 'boolean' ? { partial: value.partial } : {}),
    ...(typeof value.refreshing === 'boolean' ? { refreshing: value.refreshing } : {}),
    ...(typeof value.updatedAt === 'number' ? { updatedAt: value.updatedAt } : {}),
  }
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

function profileConnectionError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ''
  return /connection|network|fetch|abort|timeout|timed out|socket/i.test(message)
}
async function profileFetch(fetcher: typeof fetch, init: RequestInit): Promise<Response> {
  const attempts = init.method === 'GET' ? 2 : 1
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const response = await fetcher(POCKET_API.profile, {...init, cache:'no-store', signal:AbortSignal.timeout(12000)})
      if (response.status >= 500) throw new Error('Profile connection is temporarily unavailable.')
      return response
    } catch (reason) {
      if (!profileConnectionError(reason)) throw reason
      if (attempt + 1 === attempts) throw new Error(init.method === 'GET' ? 'Could not refresh your profile. Please try again.' : 'We could not confirm your profile update. Your edits are still here. Please try again.')
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }
  throw new Error('Profile is temporarily unavailable.')
}

export async function readPocketLocalCurrencyProfile({
  accessToken,
  fetcher = fetch,
}: PocketLocalCurrencyProfileReadInput): Promise<PocketLocalCurrencyProfileReadResult> {
  const response = await profileFetch(fetcher, {
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
  pocketId,
  avatarId,
  displayCurrency,
  expectedUpdatedAt,
  idempotencyKey = createPocketIdempotencyKey('profile-save'),
  fetcher = fetch,
}: PocketLocalCurrencyProfileSaveInput): Promise<PocketProfileUpsertData> {
  let response: Response
  try { response = await profileFetch(fetcher, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({
      pocketId,
      ...(avatarId !== undefined ? { avatarId } : {}),
      ...(displayCurrency !== undefined ? { displayCurrency } : {}),
      ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}),
    }),
  })
  } catch (reason) {
    try {
      const current = await readPocketLocalCurrencyProfile({accessToken,fetcher})
      if (current.profile?.updatedAt && current.profile.pocketId === normalizePocketId(pocketId)
        && (avatarId === undefined || current.profile.avatarId === avatarId)
        && (displayCurrency === undefined || current.profile.displayCurrency === displayCurrency)) return {profile:{...current.profile,updatedAt:current.profile.updatedAt},unchanged:true}
    } catch { /* Retain the edit and original recovery message. */ }
    throw reason
  }
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(pocketErrorMessage(data, 'Profile request failed.'))
  }
  return parsePocketLocalCurrencyProfileSave(data)
}

export async function readPocketActivity({
  accessToken,
  recent = false,
  fresh = false,
  signal,
  fetcher = fetch,
}: {
  accessToken: string
  recent?: boolean
  fresh?: boolean
  signal?: AbortSignal
  fetcher?: typeof fetch
}): Promise<PocketActivityReadResult> {
  const query = [recent ? 'scope=recent' : '', fresh ? 'refresh=1' : ''].filter(Boolean).join('&')
  const response = await fetcher(POCKET_API.activity + (query ? '?' + query : ''), {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
    signal,
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    throw new Error(pocketErrorMessage(data, 'Could not load Circle Pocket activity.'))
  }
  return parsePocketActivityRead(data)
}

export async function readPocketBalances({
  accessToken,
  signal,
  fetcher = fetch,
  fresh = false,
}: {
  accessToken: string
  signal?: AbortSignal
  fetcher?: typeof fetch
  fresh?: boolean
}): Promise<UnifiedBalanceResult> {
  const response = await fetcher(POCKET_API.balances + (fresh ? '?refresh=1' : ''), {
    method: 'GET', signal, cache: 'no-store',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(pocketErrorMessage(data, 'Circle Pocket balance refresh failed.'))
  if (!isRecord(data) || data.ok !== true) throw new Error(pocketErrorMessage(data, 'Circle Pocket balance refresh failed.'))
  if (!isPocketBalancesReadData(data)) throw new Error('Circle Pocket balance response was invalid.')
  return { total: data.total, rows: data.rows, totalComplete: data.totalComplete, unavailableNetworks: data.unavailableNetworks, walletUpdate: parsePocketWalletUpdateNotice(data.walletUpdate) }
}

export async function readPocketLinkedWallets({
  accessToken,
  signal,
  reader = readPocketWallets,
}: {
  accessToken: string
  signal?: AbortSignal
  reader?: typeof readPocketWallets
}): Promise<CirclePocketWallets> {
  const result = await reader({ accessToken, signal })
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

/** Isolated routing read: never replaces the full home balance snapshot. */
export async function readPocketDestinationLiquidity(accessToken:string, network:UnifiedBalanceChainKey) {
 const response=await fetch(POCKET_API.balances+'?network='+encodeURIComponent(network),{headers:{authorization:'Bearer '+accessToken},cache:'no-store',signal:AbortSignal.timeout(12000)})
 const data=await response.json().catch(()=>null)
 if(!response.ok||!data?.ok||data.network!==network||typeof data.balance!=='number'||!Number.isFinite(data.balance)||data.balance<0)throw Error('Destination balance unavailable.')
 if(data.wallet!==null&&(!isRecord(data.wallet)||typeof data.wallet.address!=='string'||typeof data.wallet.walletId!=='string'||typeof data.wallet.blockchain!=='string'))throw Error('Destination wallet unavailable.')
 return {balance:data.balance as number,wallet:data.wallet as CirclePocketWallets[UnifiedBalanceChainKey]|null}
}

export async function readPocketBankRoutingLiquidity(accessToken: string) {
  const response = await fetch(POCKET_API.balances + '?routing=bank', { headers: { authorization: 'Bearer ' + accessToken }, cache: 'no-store', signal: AbortSignal.timeout(12000) })
  const data = await response.json().catch(() => null)
  const networks = ['base', 'arbitrum', 'arc', 'solana', 'polygon'] as const
  if (!response.ok || !data?.ok || data.routing !== 'bank' || !Array.isArray(data.rows) || data.rows.length !== networks.length) throw Error('Payment balances unavailable.')
  const wallets: CirclePocketWallets = {}
  const rows = networks.map((key, index) => {
    const row = data.rows[index]
    if (row?.network !== key || (row.balance !== null && (typeof row.balance !== 'number' || !Number.isFinite(row.balance) || row.balance < 0))) throw Error('Payment balance unavailable.')
    if (row.wallet !== null) {
      if (!isRecord(row.wallet) || typeof row.wallet.address !== 'string' || typeof row.wallet.walletId !== 'string' || typeof row.wallet.blockchain !== 'string') throw Error('Payment wallet unavailable.')
      wallets[key] = row.wallet as CirclePocketWallets[typeof key]
    }
    return { key, balance: row.balance ?? 0, status: row.balance === null ? 'error' : 'ok' }
  })
  return { rows, wallets }
}
