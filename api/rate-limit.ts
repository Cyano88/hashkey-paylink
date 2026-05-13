import type { Request, Response, NextFunction } from 'express'

type RateLimitOptions = {
  windowMs: number
  max: number
  name: string
}

type Bucket = {
  resetAt: number
  count: number
}

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for']
  const ip = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0]
  return (ip ?? req.ip ?? req.socket.remoteAddress ?? 'unknown').trim()
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    const key = `${name}:${clientKey(req)}`
    const current = buckets.get(key)

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      return next()
    }

    current.count += 1
    if (current.count > max) {
      res.setHeader('Retry-After', Math.ceil((current.resetAt - now) / 1000).toString())
      return res.status(429).json({ ok: false, error: 'Too many requests. Try again shortly.' })
    }

    if (Math.random() < 0.01) {
      for (const [bucketKey, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(bucketKey)
      }
    }

    return next()
  }
}
