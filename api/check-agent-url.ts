/**
 * GET /api/check-agent-url?url=https://youragent.com/chat
 *
 * Server-side compatibility check for Access Mode agent URLs.
 * Pings the provided URL with dummy verification params and checks
 * if it returns a JSON response — indicating the agent has integrated
 * the Hash PayLink verification API.
 */
import type { Request, Response } from 'express'

export default async function handler(req: Request, res: Response) {
  const raw = (req.query.url ?? req.body?.url) as string | undefined
  if (!raw) return res.status(400).json({ compatible: false, error: 'Missing url param' })

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    return res.status(400).json({ compatible: false, error: 'Invalid URL' })
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ compatible: false, error: 'Only http/https URLs allowed' })
  }

  parsed.searchParams.set('eventId', 'test')
  parsed.searchParams.set('payer', 'test')

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 6000)
    const r = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(timeout)
    const contentType = r.headers.get('content-type') ?? ''
    return res.json({ compatible: contentType.includes('application/json') })
  } catch {
    return res.json({ compatible: false, error: 'URL unreachable or timed out' })
  }
}
