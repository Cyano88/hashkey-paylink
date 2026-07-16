import {
  POCKET_API,
  createPocketIdempotencyKey,
  isPocketMutationResult,
  isPocketPosCreateData,
  type PocketPosCreateData,
  type PocketPosCreateRequest,
} from '../lib/pocketSchemas'

function posErrorMessage(value: unknown) {
  if (!value || typeof value !== 'object') return 'POS setup failed.'
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return 'POS setup failed.'
}

export function parsePocketPosCreate(value: unknown): PocketPosCreateData {
  if (!isPocketMutationResult<PocketPosCreateData>(value)) throw new Error(posErrorMessage(value))
  if (!value.ok) throw new Error(value.error?.message ?? 'POS setup failed.')
  if (!value.data || !isPocketPosCreateData(value.data)) throw new Error('POS setup response was invalid.')
  return value.data
}

export async function createPocketPos({
  accessToken,
  request,
  idempotencyKey = createPocketIdempotencyKey('pos-create'),
  fetcher = fetch,
}: {
  accessToken: string
  request: PocketPosCreateRequest
  idempotencyKey?: string
  fetcher?: typeof fetch
}): Promise<PocketPosCreateData> {
  const response = await fetcher(POCKET_API.pos, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      'idempotency-key': idempotencyKey,
    },
    body: JSON.stringify(request),
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(posErrorMessage(data))
  return parsePocketPosCreate(data)
}
