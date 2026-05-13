import type { Request, Response } from 'express'
import dns from 'node:dns/promises'
import net from 'node:net'

export function requireAdminSecret(req: Request, res: Response): boolean {
  const secret = process.env.ADMIN_SECRET ?? process.env.CRON_SECRET
  if (!secret || secret.length < 24) {
    res.status(503).json({ ok: false, error: 'Admin secret is not configured' })
    return false
  }

  const auth = req.headers.authorization ?? ''
  const querySecret = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret
  const bodySecret = typeof req.body?.secret === 'string' ? req.body.secret : undefined
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : querySecret ?? bodySecret

  if (provided !== secret) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return false
  }

  return true
}

function isPrivateIPv4(ip: string) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a === 169 && b === 254 ||
    a === 172 && b >= 16 && b <= 31 ||
    a === 192 && b === 168 ||
    a >= 224
  )
}

function isPrivateIPv6(ip: string) {
  const normalized = ip.toLowerCase()
  return (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fe80:')
  )
}

export function isPrivateAddress(ip: string) {
  const version = net.isIP(ip)
  if (version === 4) return isPrivateIPv4(ip)
  if (version === 6) return isPrivateIPv6(ip)
  return true
}

export async function assertPublicHttpUrl(raw: string): Promise<URL> {
  const parsed = new URL(raw)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs allowed')
  }
  if (parsed.username || parsed.password) {
    throw new Error('URL credentials are not allowed')
  }
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.localhost')) {
    throw new Error('Localhost URLs are not allowed')
  }
  if (net.isIP(parsed.hostname) && isPrivateAddress(parsed.hostname)) {
    throw new Error('Private network URLs are not allowed')
  }

  const records = await dns.lookup(parsed.hostname, { all: true, verbatim: true })
  if (!records.length || records.some(record => isPrivateAddress(record.address))) {
    throw new Error('Private network URLs are not allowed')
  }

  return parsed
}
