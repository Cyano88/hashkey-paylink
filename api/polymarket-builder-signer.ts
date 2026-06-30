import type { Request, Response } from 'express'
import { BuilderConfig } from '@polymarket/builder-signing-sdk'
import { consumeBuilderSession } from './polymarket-builder-session.js'

function cleanText(value: unknown, max = 280) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function envValue(key: string) {
  return process.env[key]?.trim()
}

function bearerToken(value: unknown) {
  const text = cleanText(value, 120)
  const match = text.match(/^Bearer\s+([a-f0-9]{64})$/i)
  return match?.[1] ?? ''
}

function builderConfig() {
  const key = envValue('POLYMARKET_BUILDER_API_KEY')
  const secret = envValue('POLYMARKET_BUILDER_SECRET')
  const passphrase = envValue('POLYMARKET_BUILDER_PASSPHRASE')
  if (!key || !secret || !passphrase) return null
  return new BuilderConfig({
    localBuilderCreds: {
      key,
      secret,
      passphrase,
    },
  })
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  const id = cleanText(req.query.id, 64)
  const token = bearerToken(req.headers.authorization)
  const method = cleanText(req.body?.method, 12).toUpperCase()
  const path = cleanText(req.body?.path, 32)
  const body = typeof req.body?.body === 'string' ? req.body.body : ''
  const timestamp = typeof req.body?.timestamp === 'number' ? req.body.timestamp : undefined

  if (!/^[a-f0-9]{32}$/i.test(id) || !token) {
    return res.status(401).json({ ok: false, error: 'Builder signer session is not authorized.' })
  }
  if (method !== 'POST' || path !== '/order' || !body) {
    return res.status(400).json({ ok: false, error: 'Builder signer only supports exact Polymarket /order payloads.' })
  }
  if (!consumeBuilderSession(id, token, body)) {
    return res.status(403).json({ ok: false, error: 'Builder signer session is expired, already used, or does not match this order body.' })
  }

  const config = builderConfig()
  if (!config) return res.status(503).json({ ok: false, error: 'Polymarket builder credentials are not configured.' })

  const headers = await config.generateBuilderHeaders(method, path, body, timestamp)
  if (!headers) return res.status(503).json({ ok: false, error: 'Could not generate Polymarket builder headers.' })
  return res.status(200).json(headers)
}
