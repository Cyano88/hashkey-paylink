import {
  POCKET_API,
  isCirclePocketAgentResponse,
  type CirclePocketAgentResponse,
} from '../lib/pocketSchemas'

type AskPocketAgentInput = {
  accessToken: string
  threadId: string
  message: string
  locale?: string
  signal?: AbortSignal
  fetcher?: typeof fetch
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function errorMessage(value: unknown, fallback: string) {
  if (!isRecord(value)) return fallback
  if (typeof value.error === 'string') return value.error
  if (isRecord(value.error) && typeof value.error.message === 'string') return value.error.message
  return fallback
}

export function parsePocketAgentResponse(value: unknown): CirclePocketAgentResponse {
  if (!isCirclePocketAgentResponse(value)) throw new Error(errorMessage(value, 'Circle Pocket assistant response was invalid.'))
  return value
}

export async function askPocketAgent({
  accessToken,
  threadId,
  message,
  locale,
  signal,
  fetcher = fetch,
}: AskPocketAgentInput): Promise<CirclePocketAgentResponse> {
  const response = await fetcher(POCKET_API.agentAsk, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ threadId, message, ...(locale ? { locale } : {}) }),
    signal,
  })
  const data = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error(errorMessage(data, 'Circle Pocket assistant request failed.'))
  return parsePocketAgentResponse(data)
}
