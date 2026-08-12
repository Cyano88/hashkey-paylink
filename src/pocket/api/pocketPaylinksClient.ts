import { POCKET_API, type PocketCollectionResource } from '../lib/pocketSchemas'

function message(value: unknown, fallback: string) {
  if (!value || typeof value !== 'object') return fallback
  const error = (value as { error?: unknown }).error
  if (typeof error === 'string') return error
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    return (error as { message: string }).message
  }
  return fallback
}

export async function savePocketCollection({ accessToken, eventId, title, paymentUrl }: { accessToken: string; eventId: string; title: string; paymentUrl: string }): Promise<PocketCollectionResource> {
  const response = await fetch(POCKET_API.paylinks, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ eventId, title, paymentUrl }),
  })
  const data = await response.json().catch(() => undefined) as { ok?: boolean; link?: PocketCollectionResource; error?: unknown } | undefined
  if (!response.ok || !data?.ok || !data.link) throw new Error(message(data, 'Could not save this collection.'))
  return data.link
}
