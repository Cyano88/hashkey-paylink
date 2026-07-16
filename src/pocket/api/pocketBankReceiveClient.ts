import {
  POCKET_API,
  createPocketIdempotencyKey,
  isPocketBankReceiveCreateData,
  isPocketMutationResult,
  type PocketBankReceiveCreateData,
  type PocketBankReceiveCreateRequest,
} from '../lib/pocketSchemas'

function bankReceiveErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return 'Could not create bank receive link.'
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'Could not create bank receive link.'
}

export function parsePocketBankReceiveCreate(value: unknown): PocketBankReceiveCreateData {
  if (!isPocketMutationResult<PocketBankReceiveCreateData>(value)) throw new Error(bankReceiveErrorMessage(value))
  if (!value.ok) throw new Error(value.error?.message ?? 'Could not create bank receive link.')
  if (!value.data || !isPocketBankReceiveCreateData(value.data)) {
    throw new Error('Bank receive link response was invalid.')
  }
  return value.data
}

export async function createPocketBankReceive({
  accessToken,
  request,
  idempotencyKey = createPocketIdempotencyKey('bank-receive'),
  fetcher = fetch,
}: {
  accessToken: string
  request: PocketBankReceiveCreateRequest
  idempotencyKey?: string
  fetcher?: typeof fetch
}): Promise<PocketBankReceiveCreateData> {
  const response = await fetcher(POCKET_API.bankReceive, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(request),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(bankReceiveErrorMessage(data))
  return parsePocketBankReceiveCreate(data)
}
