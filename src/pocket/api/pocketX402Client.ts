import {
  POCKET_API,
  isPocketX402SnapshotData,
  isPocketX402ConnectionData,
  isPocketX402ActivationData,
  isPocketMutationResult,
  createPocketIdempotencyKey,
  type PocketMutationResult,
  type PocketX402ActivationData,
  type PocketX402ConnectionData,
  type PocketX402SnapshotData,
  type PocketX402WalletChoice,
} from '../lib/pocketSchemas'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(value: unknown) {
  if (!isRecord(value)) return 'Could not load x402 wallet status.'
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return 'Could not load x402 wallet status.'
}

export function parsePocketX402Snapshot(value: unknown): PocketX402SnapshotData {
  if (!isRecord(value) || value.ok !== true || !isPocketX402SnapshotData(value.snapshot)) {
    throw new Error(errorMessage(value))
  }
  return value.snapshot
}

function walletChoices(value: unknown): PocketX402WalletChoice[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(choice => {
    if (!isRecord(choice) || typeof choice.address !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(choice.address)) return []
    return [{
      address: choice.address,
      ...(typeof choice.balance === 'string' ? { balance: choice.balance } : {}),
      ...(typeof choice.balanceError === 'string' ? { balanceError: choice.balanceError } : {}),
    }]
  })
}

export class PocketX402ConnectionError extends Error {
  reason?: string
  walletChoices: PocketX402WalletChoice[]

  constructor(message: string, reason?: string, choices: PocketX402WalletChoice[] = []) {
    super(message)
    this.name = 'PocketX402ConnectionError'
    this.reason = reason
    this.walletChoices = choices
  }
}

export function parsePocketX402Connection(value: unknown): PocketX402ConnectionData {
  if (!isRecord(value) || value.ok !== true || !isPocketX402ConnectionData(value)) {
    const reason = isRecord(value) && typeof value.reason === 'string' ? value.reason : undefined
    const choices = isRecord(value) ? walletChoices(value.walletChoices) : []
    throw new PocketX402ConnectionError(errorMessage(value), reason, choices)
  }
  return {
    status: value.status,
    network: value.network,
    ...(value.walletAddress !== undefined ? { walletAddress: value.walletAddress } : {}),
    ...(value.message !== undefined ? { message: value.message } : {}),
  }
}

export async function readPocketX402Snapshot({
  accessToken,
  network = 'base',
  fetcher = fetch,
}: {
  accessToken: string
  network?: 'base' | 'arc'
  fetcher?: typeof fetch
}): Promise<PocketX402SnapshotData> {
  const response = await fetcher(`${POCKET_API.x402}?network=${network}`, {
    method: 'GET',
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(errorMessage(data))
  return parsePocketX402Snapshot(data)
}

export async function connectPocketX402Wallet({
  accessToken,
  action,
  network,
  otp,
  expectedWallet,
  fetcher = fetch,
}: {
  accessToken: string
  action: 'init' | 'complete'
  network: 'base' | 'arc'
  otp?: string
  expectedWallet?: string
  fetcher?: typeof fetch
}): Promise<PocketX402ConnectionData> {
  const response = await fetcher(POCKET_API.x402Connect, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      action,
      network,
      ...(otp !== undefined ? { otp } : {}),
      ...(expectedWallet !== undefined ? { expectedWallet } : {}),
    }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) {
    const reason = isRecord(data) && typeof data.reason === 'string' ? data.reason : undefined
    const choices = isRecord(data) ? walletChoices(data.walletChoices) : []
    throw new PocketX402ConnectionError(errorMessage(data), reason, choices)
  }
  return parsePocketX402Connection(data)
}

export function parsePocketX402Activation(value: unknown): PocketMutationResult<PocketX402ActivationData> {
  if (!isPocketMutationResult<PocketX402ActivationData>(value)) {
    throw new Error(errorMessage(value))
  }
  if (!value.ok) throw new Error(value.error?.message ?? 'x402 activation failed.')
  if (value.data !== undefined && !isPocketX402ActivationData(value.data)) {
    throw new Error('x402 activation response was invalid.')
  }
  return value
}

export async function activatePocketX402Gateway({
  accessToken,
  network,
  amount,
  idempotencyKey = createPocketIdempotencyKey('x402-activate'),
  fetcher = fetch,
}: {
  accessToken: string
  network: 'base' | 'arc'
  amount: string
  idempotencyKey?: string
  fetcher?: typeof fetch
}): Promise<PocketMutationResult<PocketX402ActivationData>> {
  const response = await fetcher(POCKET_API.x402Activate, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify({ network, amount }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(errorMessage(data))
  return parsePocketX402Activation(data)
}
