import type { Request, Response, NextFunction } from 'express'

type RateLimitOptions = {
  windowMs: number
  max: number
  name: string
}

const MAX_BUCKETS_PER_LIMITER = 10_000

type Bucket = {
  resetAt: number
  count: number
}

function clientKey(req: Request): string {
  return (req.ip || req.socket.remoteAddress || 'unknown').trim()
}

export function rateLimit({ windowMs, max, name }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>()

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
    const now = Date.now()
    const key = `${name}:${clientKey(req)}`
    const current = buckets.get(key)

    res.setHeader('RateLimit-Limit', max.toString())

    if (!current || current.resetAt <= now) {
      if (buckets.size >= MAX_BUCKETS_PER_LIMITER) {
        for (const [bucketKey, bucket] of buckets) {
          if (bucket.resetAt <= now) buckets.delete(bucketKey)
        }
        if (buckets.size >= MAX_BUCKETS_PER_LIMITER) buckets.delete(buckets.keys().next().value as string)
      }
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      res.setHeader('RateLimit-Remaining', Math.max(0, max - 1).toString())
      res.setHeader('RateLimit-Reset', Math.ceil((now + windowMs) / 1000).toString())
      return next()
    }

    current.count += 1
    res.setHeader('RateLimit-Remaining', Math.max(0, max - current.count).toString())
    res.setHeader('RateLimit-Reset', Math.ceil(current.resetAt / 1000).toString())
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
