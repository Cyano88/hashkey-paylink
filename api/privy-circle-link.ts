import type { Request, Response } from 'express'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, resolve } from 'path'
import { isAddress } from 'viem'
import { PublicKey } from '@solana/web3.js'
import { PrivyClient, type User } from '@privy-io/server-auth'

const STORE_PATH = process.env.PRIVY_CIRCLE_LINK_STORE ?? './data/privy-circle-links.json'

const SUPPORTED_CHAINS = new Set(['base', 'arbitrum', 'arc', 'solana'])

type CircleLinkRecord = {
  privyUserId: string
  email?: string
  chain: 'base' | 'arbitrum' | 'arc' | 'solana'
  circleWalletId: string
  circleWalletAddress: string
  circleBlockchain: string
  updatedAt: number
}

type Store = {
  links: Record<string, CircleLinkRecord>
}

function linkKey(privyUserId: string, chain: string) {
  return `${privyUserId}:${chain}`
}

function getBearerToken(req: Request) {
  const auth = req.headers.authorization ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

function linkedEmail(user: User) {
  for (const account of user.linkedAccounts ?? []) {
    if (account.type === 'email' && 'address' in account && typeof account.address === 'string') {
      return account.address.toLowerCase()
    }
  }
  return undefined
}

function isSolanaAddress(address: string) {
  try {
    const key = new PublicKey(address)
    return key.toBase58() === address
  } catch {
    return false
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(resolve(STORE_PATH), 'utf8')
    const parsed = JSON.parse(raw) as Partial<Store>
    return { links: parsed.links ?? {} }
  } catch {
    return { links: {} }
  }
}

async function writeStore(store: Store) {
  const path = resolve(STORE_PATH)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

async function verifiedPrivyUser(req: Request) {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const err = new Error('Privy Circle linking is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET server-side.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const token = getBearerToken(req)
  if (!token) {
    const err = new Error('Missing Privy access token.')
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  const user = await client.getUserById(claims.userId)
  return { claims, user, email: linkedEmail(user) }
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { action, chain, email, wallet } = (req.body ?? {}) as {
      action?: string
      chain?: string
      email?: string
      wallet?: { id?: string; address?: string; blockchain?: string }
    }
    if (!action) return res.status(400).json({ ok: false, error: 'Missing action' })
    if (!chain || !SUPPORTED_CHAINS.has(chain)) {
      return res.status(400).json({ ok: false, error: 'Unsupported Circle link chain' })
    }

    const { claims, email: verifiedEmail } = await verifiedPrivyUser(req)
    const store = await readStore()
    const key = linkKey(claims.userId, chain)

    if (action === 'resolve') {
      return res.json({ ok: true, email: verifiedEmail, link: store.links[key] ?? null })
    }

    if (action === 'link') {
      if (!wallet?.id || !wallet.address || !wallet.blockchain) {
        return res.status(400).json({ ok: false, error: 'Missing Circle wallet metadata' })
      }
      const validWalletAddress = chain === 'solana'
        ? isSolanaAddress(wallet.address)
        : isAddress(wallet.address)
      if (!validWalletAddress) {
        return res.status(400).json({ ok: false, error: 'Invalid Circle wallet address' })
      }

      const normalizedEmail = email?.trim().toLowerCase()
      if (verifiedEmail && normalizedEmail && verifiedEmail !== normalizedEmail) {
        return res.status(403).json({
          ok: false,
          error: 'Privy email does not match the Circle wallet email. Use the same email for both logins.',
        })
      }

      const record: CircleLinkRecord = {
        privyUserId: claims.userId,
        email: verifiedEmail ?? normalizedEmail,
        chain: chain as CircleLinkRecord['chain'],
        circleWalletId: wallet.id,
        circleWalletAddress: wallet.address,
        circleBlockchain: wallet.blockchain,
        updatedAt: Date.now(),
      }
      store.links[key] = record
      await writeStore(store)
      return res.json({ ok: true, link: record })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const e = err as Error & { status?: number }
    return res.status(e.status ?? 500).json({ ok: false, error: e.message || 'Privy Circle link request failed' })
  }
}
