import {
  POCKET_API,
  createPocketIdempotencyKey,
  isPocketMutationResult,
  isPocketWalletLinkMutationData,
  isPocketWalletsReadData,
  type PocketNetwork,
  type PocketWalletLinkMutationData,
  type PocketWalletLinkRecord,
  type PocketWalletsReadData,
} from '../lib/pocketSchemas'

type PocketWalletLinkInput = {
  accessToken: string
  network: PocketNetwork
  circleUserToken: string
  wallet: PocketWalletLinkRecord['wallet']
  expectedUpdatedAt?: number
  idempotencyKey?: string
  fetcher?: typeof fetch
}

type PocketWalletUnlinkInput = {
  accessToken: string
  network: PocketNetwork
  expectedUpdatedAt?: number
  idempotencyKey?: string
  fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function walletLinkErrorMessage(value: unknown) {
  if (!isRecord(value)) return 'Circle wallet link request failed.'
  if (typeof value.error === 'string') return value.error
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return 'Circle wallet link request failed.'
}

export function parsePocketWalletLinkMutation(value: unknown): PocketWalletLinkMutationData {
  if (!isPocketMutationResult<PocketWalletLinkMutationData>(value)) {
    throw new Error(walletLinkErrorMessage(value))
  }
  if (!value.ok) throw new Error(value.error?.message ?? 'Circle wallet link request failed.')
  if (!value.data || !isPocketWalletLinkMutationData(value.data)) {
    throw new Error('Circle wallet link response was invalid.')
  }
  return value.data
}

export function parsePocketWalletsRead(value: unknown): PocketWalletsReadData {
  if (!isRecord(value) || value.ok !== true) {
    throw new Error(walletLinkErrorMessage(value))
  }
  if (!isPocketWalletsReadData(value)) {
    throw new Error('Circle wallet read response was invalid.')
  }
  return { wallets: value.wallets }
}

export async function readPocketWallets({
  accessToken,
  fetcher = fetch,
}: {
  accessToken: string
  fetcher?: typeof fetch
}): Promise<PocketWalletsReadData> {
  const response = await fetcher(POCKET_API.wallets, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(walletLinkErrorMessage(data))
  return parsePocketWalletsRead(data)
}

export async function readPocketWallet({
  accessToken,
  network,
  fetcher = fetch,
}: {
  accessToken: string
  network: PocketNetwork
  fetcher?: typeof fetch
}): Promise<PocketWalletLinkRecord | null> {
  const result = await readPocketWallets({ accessToken, fetcher })
  return result.wallets[network] ?? null
}

async function mutatePocketWalletLink({
  accessToken,
  body,
  idempotencyKey,
  fetcher,
}: {
  accessToken: string
  body: Record<string, unknown>
  idempotencyKey: string
  fetcher: typeof fetch
}) {
  const response = await fetcher(POCKET_API.walletLink, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(body),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(walletLinkErrorMessage(data))
  return parsePocketWalletLinkMutation(data)
}

export async function linkPocketWallet({
  accessToken,
  network,
  circleUserToken,
  wallet,
  expectedUpdatedAt,
  idempotencyKey = createPocketIdempotencyKey('wallet-link'),
  fetcher = fetch,
}: PocketWalletLinkInput): Promise<PocketWalletLinkMutationData> {
  return mutatePocketWalletLink({
    accessToken,
    idempotencyKey,
    fetcher,
    body: {
      action: 'link',
      network,
      circleUserToken,
      wallet,
      ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    },
  })
}

export async function unlinkPocketWallet({
  accessToken,
  network,
  expectedUpdatedAt,
  idempotencyKey = createPocketIdempotencyKey('wallet-unlink'),
  fetcher = fetch,
}: PocketWalletUnlinkInput): Promise<PocketWalletLinkMutationData> {
  return mutatePocketWalletLink({
    accessToken,
    idempotencyKey,
    fetcher,
    body: {
      action: 'unlink',
      network,
      ...(expectedUpdatedAt !== undefined ? { expectedUpdatedAt } : {}),
    },
  })
}
