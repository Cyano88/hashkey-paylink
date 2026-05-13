/**
 * GET /api/check-agent-url?url=https://youragent.com/chat
 *
 * Server-side compatibility check for Access Mode agent URLs.
 * Pings the provided URL with dummy verification params and checks
 * if it returns a JSON response — indicating the agent has integrated
 * the Hash PayLink verification API.
 */
import type { Request, Response } from 'express'
import { assertPublicHttpUrl } from './security.js'

export default async function handler(req: Request, res: Response) {
  const raw = (req.query.url ?? req.body?.url) as string | undefined
  if (!raw) return res.status(400).json({ compatible: false, error: 'Missing url param' })
  if (raw.length > 2048) return res.status(400).json({ compatible: false, error: 'URL is too long' })

  let parsed: URL
  try {
    parsed = await assertPublicHttpUrl(raw)
  } catch (err) {
    return res.status(400).json({
      compatible: false,
      error: err instanceof Error ? err.message : 'Invalid URL',
    })
  }

  parsed.searchParams.set('eventId', 'test')
  parsed.searchParams.set('payer', 'test')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const r = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
      redirect: 'manual',
    })
    clearTimeout(timeout)
    const contentType = r.headers.get('content-type') ?? ''
    return res.json({ compatible: contentType.includes('application/json') })
  } catch {
    return res.json({ compatible: false, error: 'URL unreachable or timed out' })
  }
}
