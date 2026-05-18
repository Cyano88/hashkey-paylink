import type { Request, Response } from 'express'
import { execFile } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import crypto from 'node:crypto'

const execFileAsync = promisify(execFile)
const CIRCLE_BIN = process.platform === 'win32' ? 'circle.cmd' : 'circle'
const STORE_PATH = process.env.AGENT_WALLET_PROVISION_STORE ?? './data/agent-wallet-provisioning.json'
const CIRCLE_CLI_ENABLED = ['1', 'true', 'yes', 'on'].includes(String(process.env.CIRCLE_CLI_ENABLED ?? '').toLowerCase())

type PendingSession = {
  agentSlug: string
  emailHash: string
  requestId?: string
  testnet: boolean
  createdAt: number
}

type StoreData = {
  pending: Record<string, PendingSession>
  agents?: Record<string, { walletAddress: string; chain: string; updatedAt: number }>
}

function normalizeEmail(value: unknown) {
  const email = String(value ?? '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function normalizeSlug(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 32)
}

function safeSessionKey(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80)
}

function emailHash(email: string) {
  return crypto.createHash('sha256').update(email).digest('hex')
}

function sessionId(agentSlug: string, email: string) {
  return crypto.createHash('sha256').update(`${agentSlug}:${email}`).digest('hex').slice(0, 32)
}

async function readStore(): Promise<StoreData> {
  try {
    return JSON.parse(await readFile(STORE_PATH, 'utf8')) as StoreData
  } catch {
    return { pending: {}, agents: {} }
  }
}

async function writeStore(data: StoreData) {
  await mkdir(dirname(STORE_PATH), { recursive: true })
  await writeFile(STORE_PATH, JSON.stringify(data, null, 2))
}

function parseRequestId(output: string) {
  return output.match(/request(?:\s|-)?id[^a-zA-Z0-9_-]+([a-zA-Z0-9_-]{8,})/i)?.[1]
    ?? output.match(/\b[a-f0-9]{8,}(?:-[a-f0-9]{4,}){2,}\b/i)?.[0]
}

function parseWalletAddress(output: string) {
  try {
    const parsed = JSON.parse(output) as unknown
    const queue = [parsed]
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (typeof item === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item)) return item
      if (Array.isArray(item)) queue.push(...item)
      if (typeof item === 'object') queue.push(...Object.values(item as Record<string, unknown>))
    }
  } catch {
    // CLI can return text tables depending on version; parse those below.
  }
  return output.match(/0x[a-fA-F0-9]{40}/)?.[0]
}

async function runCircle(args: string[], key: string) {
  const sessionHome = resolve(process.cwd(), 'data', 'circle-web-sessions', safeSessionKey(key))
  await mkdir(sessionHome, { recursive: true })
  const { stdout, stderr } = await execFileAsync(CIRCLE_BIN, args, {
    timeout: 60_000,
    maxBuffer: 128 * 1024,
    shell: false,
    env: {
      ...process.env,
      HOME: sessionHome,
      USERPROFILE: sessionHome,
      CIRCLE_ACCEPT_TERMS: '1',
    },
  })
  return [stdout, stderr].filter(Boolean).join('\n').trim()
}

export default async function handler(req: Request, res: Response) {
  if (req.method === 'GET') {
    const agentSlug = normalizeSlug(req.query.agent)
    if (!agentSlug) return res.status(400).json({ ok: false, error: 'Missing agent name.' })
    const store = await readStore()
    const record = store.agents?.[agentSlug]
    return res.json({
      ok: true,
      found: !!record,
      agentSlug,
      walletAddress: record?.walletAddress,
      chain: record?.chain,
      updatedAt: record?.updatedAt,
    })
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' })
  if (!CIRCLE_CLI_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: 'Circle wallet provisioning is not enabled on this server.',
      setup: 'Install @circle-fin/cli and set CIRCLE_CLI_ENABLED=true.',
    })
  }

  const action = String(req.body?.action ?? '').trim().toLowerCase()
  const agentSlug = normalizeSlug(req.body?.agentSlug)
  const email = normalizeEmail(req.body?.email)
  const testnet = req.body?.testnet !== false
  if (!agentSlug || !email) return res.status(400).json({ ok: false, error: 'Missing agent name or email.' })

  const id = sessionId(agentSlug, email)
  const key = `${agentSlug}_${id}`

  try {
    if (action === 'init') {
      const args = ['wallet', 'login', email, '--init', ...(testnet ? ['--testnet'] : [])]
      const output = await runCircle(args, key)
      const requestId = parseRequestId(output)
      const store = await readStore()
      store.pending[id] = { agentSlug, emailHash: emailHash(email), requestId, testnet, createdAt: Date.now() }
      await writeStore(store)
      return res.json({ ok: true, sessionId: id, requestId, message: 'OTP sent by Circle.' })
    }

    if (action === 'complete') {
      const otp = String(req.body?.otp ?? '').trim()
      if (!/^[a-zA-Z0-9-]{4,32}$/.test(otp)) return res.status(400).json({ ok: false, error: 'Invalid OTP.' })
      const store = await readStore()
      const pending = store.pending[id]
      if (!pending || pending.agentSlug !== agentSlug || pending.emailHash !== emailHash(email)) {
        return res.status(400).json({ ok: false, error: 'Start provisioning again before entering OTP.' })
      }
      if (!pending.requestId) {
        return res.status(400).json({ ok: false, error: 'Circle did not return a request id. Use the CLI fallback.' })
      }

      await runCircle(['wallet', 'login', '--request', pending.requestId, '--otp', otp, ...(pending.testnet ? ['--testnet'] : [])], key)
      const chain = pending.testnet ? 'ARC-TESTNET' : 'BASE'
      let listOutput = ''
      try {
        listOutput = await runCircle(['wallet', 'list', '--type', 'agent', '--chain', chain, '--output', 'json'], key)
      } catch {
        listOutput = await runCircle(['wallet', 'list', '--type', 'agent', '--chain', chain], key)
      }
      const walletAddress = parseWalletAddress(listOutput)
      if (!walletAddress) return res.status(502).json({ ok: false, error: 'Circle login completed, but no wallet address was found.' })
      delete store.pending[id]
      store.agents = { ...(store.agents ?? {}), [agentSlug]: { walletAddress, chain, updatedAt: Date.now() } }
      await writeStore(store)
      return res.json({ ok: true, walletAddress, chain, agentSlug })
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string }
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').slice(0, 1200)
    return res.status(500).json({ ok: false, error: detail || 'Circle CLI request failed.' })
  }
}
