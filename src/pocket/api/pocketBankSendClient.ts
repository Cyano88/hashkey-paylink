import {
  POCKET_API,
  createPocketIdempotencyKey,
  isPocketBankSendCreateData,
  isPocketMutationResult,
  type PocketBankSendCreateData,
  type PocketBankSendCreateRequest,
} from '../lib/pocketSchemas'

function bankSendErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return 'Could not create bank-to-USDC link.'
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Could not create bank-to-USDC link.'
}

export function parsePocketBankSendCreate(value: unknown): PocketBankSendCreateData {
  if (!isPocketMutationResult<PocketBankSendCreateData>(value)) throw new Error(bankSendErrorMessage(value))
  if (!value.ok) throw new Error(value.error?.message ?? 'Could not create bank-to-USDC link.')
  if (!value.data || !isPocketBankSendCreateData(value.data)) {
    throw new Error('Bank-to-USDC link response was invalid.')
  }
  return value.data
}

export async function createPocketBankSend({
  accessToken,
  request,
  idempotencyKey = createPocketIdempotencyKey('bank-send'),
  fetcher = fetch,
}: {
  accessToken: string
  request: PocketBankSendCreateRequest
  idempotencyKey?: string
  fetcher?: typeof fetch
}): Promise<PocketBankSendCreateData> {
  const response = await fetcher(POCKET_API.bankSend, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(request),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(bankSendErrorMessage(data))
  return parsePocketBankSendCreate(data)
}
