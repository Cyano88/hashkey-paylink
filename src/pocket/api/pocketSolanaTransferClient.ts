import {
  POCKET_API,
  isPocketSolanaTransferPrepareData,
  isPocketSolanaTransferSubmitData,
  type PocketSolanaTransferPrepareData,
  type PocketSolanaTransferSubmitData,
} from '../lib/pocketSchemas'

function transferErrorMessage(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}

export function parsePocketSolanaTransferPrepare(value: unknown): PocketSolanaTransferPrepareData {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
    throw new Error(transferErrorMessage(value, 'Failed to prepare Solana withdrawal.'))
  }
  if (!isPocketSolanaTransferPrepareData(value)) throw new Error('Solana withdrawal preparation response was invalid.')
  return { transaction: value.transaction, lastValidBlockHeight: value.lastValidBlockHeight }
}

export function parsePocketSolanaTransferSubmit(value: unknown): PocketSolanaTransferSubmitData {
  if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
    throw new Error(transferErrorMessage(value, 'Solana relay failed.'))
  }
  if (!isPocketSolanaTransferSubmitData(value)) throw new Error('Solana withdrawal submission response was invalid.')
  return {
    txHash: value.txHash,
    status: value.status,
    ...(value.warning !== undefined ? { warning: value.warning } : {}),
  }
}

export async function preparePocketSolanaTransfer({
  accessToken,
  recipient,
  amount,
  fetcher = fetch,
}: {
  accessToken: string
  recipient: string
  amount: string
  fetcher?: typeof fetch
}): Promise<PocketSolanaTransferPrepareData> {
  const response = await fetcher(POCKET_API.transferPrepare, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ recipient, amount }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(transferErrorMessage(data, 'Failed to prepare Solana withdrawal.'))
  return parsePocketSolanaTransferPrepare(data)
}

export async function submitPocketSolanaTransfer({
  accessToken,
  transaction,
  lastValidBlockHeight,
  fetcher = fetch,
}: {
  accessToken: string
  transaction: string
  lastValidBlockHeight: number
  fetcher?: typeof fetch
}): Promise<PocketSolanaTransferSubmitData> {
  const response = await fetcher(POCKET_API.transferSubmit, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ transaction, lastValidBlockHeight }),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(transferErrorMessage(data, 'Solana relay failed.'))
  return parsePocketSolanaTransferSubmit(data)
}
