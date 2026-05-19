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
const SERVICE_SECRET = process.env.AGENT_WALLET_SERVICE_SECRET
const DEFAULT_SCOUT_URL = `${(process.env.HASH_PAYLINK_BASE_URL ?? 'https://hashpaylink.com').replace(/\/+$/, '')}/api/x402/polymarket-scout`
const ALLOWED_SERVICE_URLS = new Set(
  (process.env.AGENT_WALLET_ALLOWED_SERVICE_URLS ?? process.env.X402_POLYMARKET_SCOUT_URL ?? DEFAULT_SCOUT_URL)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean),
)
const MAX_SERVICE_AMOUNT = Number(process.env.AGENT_WALLET_MAX_SERVICE_AMOUNT ?? process.env.X402_POLYMARKET_SCOUT_MAX_AMOUNT ?? '0.01')
const MAX_GATEWAY_DEPOSIT_AMOUNT = Number(process.env.AGENT_WALLET_MAX_GATEWAY_DEPOSIT_AMOUNT ?? '5')
const GATEWAY_BALANCE_CHAIN = process.env.AGENT_WALLET_GATEWAY_BALANCE_CHAIN ?? 'MATIC'
const GATEWAY_DEPOSIT_CHAIN = process.env.AGENT_WALLET_GATEWAY_DEPOSIT_CHAIN ?? 'BASE'

type PendingSession = {
  agentSlug: string
  emailHash: string
  requestId?: string
  testnet: boolean
  createdAt: number
}

type StoreData = {
  pending: Record<string, PendingSession>
  agents?: Record<string, { walletAddress: string; chain: string; emailHash?: string; sessionId?: string; updatedAt: number }>
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

function cleanAmount(value: unknown) {
  const amount = Number(String(value ?? '').trim())
  return Number.isFinite(amount) && amount > 0 ? amount : undefined
}

function clampAmount(value: unknown, max: number) {
  const amount = cleanAmount(value)
  if (!amount || !Number.isFinite(max) || max <= 0) return undefined
  return Math.min(amount, max)
}

function normalizeBalanceChain(value: unknown, fallback = 'BASE') {
  const key = String(value ?? '').trim().toLowerCase()
  if (key === 'base') return 'BASE'
  if (key === 'arbitrum' || key === 'arb') return 'ARBITRUM'
  if (key === 'arc' || key === 'arc-testnet' || key === 'arc_testnet') return 'ARC-TESTNET'
  const upper = key.toUpperCase()
  if (upper === 'BASE' || upper === 'ARBITRUM' || upper === 'ARC-TESTNET') return upper
  return fallback
}

function extractJsonFromCliOutput(output: string) {
  const start = output.indexOf('{')
  const end = output.lastIndexOf('}')
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(output.slice(start, end + 1)) as unknown
  } catch {
    return undefined
  }
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
  return parseWalletAddresses(output)[0]
}

function parseWalletAddresses(output: string) {
  const addresses = new Set<string>()
  try {
    const parsed = JSON.parse(output) as unknown
    const queue = [parsed]
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (typeof item === 'string' && /^0x[a-fA-F0-9]{40}$/.test(item)) {
        addresses.add(item)
        continue
      }
      if (Array.isArray(item)) queue.push(...item)
      if (typeof item === 'object') queue.push(...Object.values(item as Record<string, unknown>))
    }
  } catch {
    // CLI can return text tables depending on version; parse those below.
  }
  for (const match of output.matchAll(/0x[a-fA-F0-9]{40}/g)) addresses.add(match[0])
  return [...addresses]
}

function normalizeExpectedWallet(value: unknown) {
  const wallet = String(value ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(wallet) ? wallet : ''
}

function parseBalance(output: string) {
  const cleanOutput = output.replace(/\u001b\[[0-9;]*m/g, '')
  try {
    const parsed = JSON.parse(cleanOutput) as unknown
    const queue = [parsed]
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (typeof item === 'string') {
        const textValue = parseBalanceText(item)
        if (textValue !== undefined) return textValue
        continue
      }
      if (Array.isArray(item)) queue.push(...item)
      if (typeof item !== 'object') continue
      const record = item as Record<string, unknown>
      for (const [key, value] of Object.entries(record)) {
        if (/usdc/i.test(key)) {
          if (typeof value === 'number' || typeof value === 'string') {
            const parsedValue = String(value).match(/\d+(?:\.\d+)?/)?.[0]
            if (parsedValue !== undefined) return parsedValue
          }
          if (value && typeof value === 'object') queue.push(value)
        }
      }
      const token = String(record.token ?? record.symbol ?? record.currency ?? record.asset ?? '').toLowerCase()
      const raw =
        record.balance ??
        record.amount ??
        record.availableBalance ??
        record.available ??
        record.formattedBalance ??
        record.formatted ??
        record.value
      if ((token === '' || token === 'usdc' || token.includes('usdc')) && (typeof raw === 'number' || typeof raw === 'string')) {
        const value = String(raw)
        if (/^\d+(\.\d+)?$/.test(value)) return value
      }
      queue.push(...Object.values(record))
    }
  } catch {
    // CLI can return text tables depending on version; parse those below.
  }
  return parseBalanceText(cleanOutput)
}

function parseBalanceText(output: string) {
  const direct = output.match(/\b\d+(?:\.\d+)?\s+USDC\b/i)?.[0]?.replace(/\s+USDC/i, '')
    ?? output.match(/\bUSDC\b[^\d]*(\d+(?:\.\d+)?)/i)?.[1]
  if (direct !== undefined) return direct
  if (/\bUSDC\b/i.test(output)) {
    const tableNumber = output.match(/[│|]\s*(\d+(?:\.\d+)?)\s*[│|]/)?.[1]
    if (tableNumber !== undefined) return tableNumber
  }
  const withoutAddresses = output.replace(/0x[a-fA-F0-9]{40}/g, '')
  const labelled = withoutAddresses.match(/\b(?:balance|available|amount|total)\b[^\d]*(\d+(?:\.\d+)?)/i)?.[1]
  if (labelled !== undefined) return labelled
  const numericValues = [...withoutAddresses.matchAll(/\b\d+(?:\.\d+)?\b/g)].map(match => match[0])
  if (numericValues.length === 1) return numericValues[0]
  if (/no\s+(token\s+)?balances?|not\s+found|empty/i.test(output)) return '0'
  return undefined
}

function isCircleLoginExpired(error: unknown) {
  const err = error as Error & { stdout?: string; stderr?: string }
  const detail = [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
  return /not logged in|session expired|run [`']?circle wallet login/i.test(detail)
}

async function runCircle(args: string[], key: string, timeoutMs = 60_000) {
  const sessionHome = resolve(process.cwd(), 'data', 'circle-web-sessions', safeSessionKey(key))
  await mkdir(sessionHome, { recursive: true })
  const { stdout, stderr } = await execFileAsync(CIRCLE_BIN, args, {
    timeout: timeoutMs,
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
    const balanceChain = normalizeBalanceChain(req.query.chain, record?.chain ?? 'BASE')
    let balance: string | undefined
    let balanceError: string | undefined
    let balanceChecked = false
    let gatewayBalance: string | undefined
    let gatewayBalanceError: string | undefined
    let gatewayBalanceChecked = false
    if (record?.walletAddress && req.query.balance === '1' && !record.sessionId) {
      balanceChecked = true
      balanceError = 'Reconnect this agent wallet to enable balance lookup.'
    } else if (record?.walletAddress && req.query.balance === '1' && !CIRCLE_CLI_ENABLED) {
      balanceChecked = true
      balanceError = 'Circle CLI balance lookup is not enabled on this server.'
    } else if (record?.walletAddress && record.sessionId && req.query.balance === '1' && CIRCLE_CLI_ENABLED) {
      balanceChecked = true
      try {
        const key = `${agentSlug}_${record.sessionId}`
        let output = ''
        try {
          output = await runCircle(['wallet', 'balance', '--address', record.walletAddress, '--chain', balanceChain, '--output', 'json'], key, 30_000)
        } catch {
          output = await runCircle(['wallet', 'balance', '--address', record.walletAddress, '--chain', balanceChain], key, 30_000)
        }
        balance = parseBalance(output)
        if (balance === undefined) balanceError = 'Circle CLI returned no parseable USDC balance.'
      } catch (err) {
        balanceError = err instanceof Error ? err.message.slice(0, 240) : 'Balance lookup failed.'
      }
    }
    if (record?.walletAddress && req.query.x402 === '1' && !record.sessionId) {
      gatewayBalanceChecked = true
      gatewayBalanceError = 'Reconnect this agent wallet to enable x402 balance lookup.'
    } else if (record?.walletAddress && req.query.x402 === '1' && !CIRCLE_CLI_ENABLED) {
      gatewayBalanceChecked = true
      gatewayBalanceError = 'Circle CLI x402 balance lookup is not enabled on this server.'
    } else if (record?.walletAddress && record.sessionId && req.query.x402 === '1' && CIRCLE_CLI_ENABLED) {
      gatewayBalanceChecked = true
      try {
        const key = `${agentSlug}_${record.sessionId}`
        let output = ''
        try {
          output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', GATEWAY_BALANCE_CHAIN, '--output', 'json'], key, 30_000)
        } catch {
          output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', GATEWAY_BALANCE_CHAIN], key, 30_000)
        }
        gatewayBalance = parseBalance(output)
        if (gatewayBalance === undefined) gatewayBalanceError = 'Circle CLI returned no parseable x402 balance.'
      } catch (err) {
        gatewayBalanceError = err instanceof Error ? err.message.slice(0, 240) : 'x402 balance lookup failed.'
      }
    }
    return res.json({
      ok: true,
      found: !!record,
      agentSlug,
      walletAddress: record?.walletAddress,
      connected: !!record?.sessionId,
      chain: balanceChain,
      storedChain: record?.chain,
      balance,
      balanceChecked,
      balanceError,
      gatewayBalance,
      gatewayBalanceChecked,
      gatewayBalanceError,
      gatewayBalanceChain: GATEWAY_BALANCE_CHAIN,
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
  if (!agentSlug) return res.status(400).json({ ok: false, error: 'Missing agent name.' })

  const id = email ? sessionId(agentSlug, email) : ''
  const key = `${agentSlug}_${id}`

  try {
    if (action === 'init') {
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email.' })
      const args = ['wallet', 'login', email, '--init', ...(testnet ? ['--testnet'] : [])]
      const output = await runCircle(args, key)
      const requestId = parseRequestId(output)
      const store = await readStore()
      store.pending[id] = { agentSlug, emailHash: emailHash(email), requestId, testnet, createdAt: Date.now() }
      await writeStore(store)
      return res.json({ ok: true, sessionId: id, requestId, message: 'OTP sent by Circle.' })
    }

    if (action === 'complete') {
      if (!email) return res.status(400).json({ ok: false, error: 'Missing email.' })
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
      const wallets = parseWalletAddresses(listOutput)
      const existing = store.agents?.[agentSlug]
      const expectedWallet = normalizeExpectedWallet(req.body?.expectedWallet)
      const walletAddress =
        (expectedWallet && wallets.find(item => item.toLowerCase() === expectedWallet.toLowerCase()))
        || (existing?.walletAddress && wallets.find(item => item.toLowerCase() === existing.walletAddress.toLowerCase()))
        || wallets[0]
      if (!walletAddress) return res.status(502).json({ ok: false, error: 'Circle login completed, but no wallet address was found.' })
      delete store.pending[id]
      const explicitExpectedMatch = expectedWallet && walletAddress.toLowerCase() === expectedWallet.toLowerCase()
      if (existing?.walletAddress && existing.walletAddress.toLowerCase() !== walletAddress.toLowerCase() && !explicitExpectedMatch) {
        return res.status(409).json({
          ok: false,
          code: 'wallet_mismatch',
          error: 'This Circle login returned a different agent wallet. The existing wallet was not replaced.',
          existingWallet: existing.walletAddress,
          newWallet: walletAddress,
        })
      }
      store.agents = {
        ...(store.agents ?? {}),
        [agentSlug]: { walletAddress, chain, emailHash: pending.emailHash, sessionId: id, updatedAt: Date.now() },
      }
      await writeStore(store)
      return res.json({ ok: true, walletAddress, chain, agentSlug })
    }

    if (action === 'disconnect') {
      const store = await readStore()
      const record = store.agents?.[agentSlug]
      if (!record) return res.json({ ok: true, disconnected: true, agentSlug })
      store.agents = {
        ...(store.agents ?? {})
      }
      delete store.agents[agentSlug]
      await writeStore(store)
      return res.json({ ok: true, disconnected: true, forgotten: true, agentSlug })
    }

    if (action === 'gateway-balance') {
      const store = await readStore()
      const record = store.agents?.[agentSlug]
      if (!record?.walletAddress || !record.sessionId) {
        return res.status(404).json({ ok: false, error: 'Agent wallet session not found. Login on the web dashboard first.' })
      }

      const serviceKey = `${agentSlug}_${record.sessionId}`
      let output = ''
      try {
        output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', GATEWAY_BALANCE_CHAIN, '--output', 'json'], serviceKey, 30_000)
      } catch {
        output = await runCircle(['gateway', 'balance', '--address', record.walletAddress, '--chain', GATEWAY_BALANCE_CHAIN], serviceKey, 30_000)
      }
      const gatewayBalance = parseBalance(output)
      return res.json({
        ok: true,
        agentSlug,
        walletAddress: record.walletAddress,
        gatewayBalance,
        gatewayBalanceChain: GATEWAY_BALANCE_CHAIN,
        raw: output.slice(0, 1200),
      })
    }

    if (action === 'gateway-deposit') {
      const amount = clampAmount(req.body?.amount, MAX_GATEWAY_DEPOSIT_AMOUNT)
      if (!amount) return res.status(400).json({ ok: false, error: 'Invalid x402 activation amount.' })

      const store = await readStore()
      const record = store.agents?.[agentSlug]
      if (!record?.walletAddress || !record.sessionId) {
        return res.status(404).json({ ok: false, error: 'Agent wallet session not found. Login on the web dashboard first.' })
      }

      const serviceKey = `${agentSlug}_${record.sessionId}`
      let output = ''
      try {
        output = await runCircle([
          'gateway',
          'deposit',
          '--amount',
          String(amount),
          '--address',
          record.walletAddress,
          '--chain',
          GATEWAY_DEPOSIT_CHAIN,
          '--method',
          'eco',
        ], serviceKey, 120_000)
      } catch (err) {
        if (isCircleLoginExpired(err)) {
          return res.status(409).json({
            ok: false,
            code: 'circle_session_expired',
            error: 'Circle Agent Wallet is connected, but the secure session expired. Reconnect the wallet, then retry x402 activation.',
          })
        }
        throw err
      }

      return res.json({
        ok: true,
        agentSlug,
        walletAddress: record.walletAddress,
        amount: String(amount),
        depositChain: GATEWAY_DEPOSIT_CHAIN,
        gatewayBalanceChain: GATEWAY_BALANCE_CHAIN,
        response: extractJsonFromCliOutput(output),
        raw: output.slice(0, 3000),
      })
    }

    if (action === 'pay-service') {
      const secret = String(req.headers['x-agent-wallet-secret'] ?? req.body?.secret ?? '')
      const authorized = SERVICE_SECRET
        && secret.length === SERVICE_SECRET.length
        && crypto.timingSafeEqual(Buffer.from(secret), Buffer.from(SERVICE_SECRET))
      if (!authorized) return res.status(401).json({ ok: false, error: 'Unauthorized' })

      const serviceUrl = String(req.body?.serviceUrl ?? '').trim()
      const requested = cleanAmount(req.body?.maxAmount)
      const maxAmount = Math.min(requested ?? MAX_SERVICE_AMOUNT, MAX_SERVICE_AMOUNT)
      if (!ALLOWED_SERVICE_URLS.has(serviceUrl)) return res.status(403).json({ ok: false, error: 'Service URL is not allowlisted.' })
      if (!maxAmount || maxAmount <= 0) return res.status(400).json({ ok: false, error: 'Invalid max amount.' })

      const store = await readStore()
      const record = store.agents?.[agentSlug]
      if (!record?.walletAddress || !record.sessionId) {
        return res.status(404).json({ ok: false, error: 'Agent wallet session not found. Create the wallet on the web dashboard first.' })
      }

      const serviceKey = `${agentSlug}_${record.sessionId}`
      let output = ''
      try {
        output = await runCircle([
          'services',
          'pay',
          serviceUrl,
          '--address',
          record.walletAddress,
          '--chain',
          'BASE',
          '--max-amount',
          String(maxAmount),
        ], serviceKey)
      } catch (err) {
        if (isCircleLoginExpired(err)) {
          return res.status(409).json({
            ok: false,
            code: 'circle_session_expired',
            error: 'Circle Agent Wallet is connected, but the secure spending session expired. Reconnect the wallet on the agent dashboard, then retry /lp x402.',
          })
        }
        throw err
      }

      return res.json({
        ok: true,
        agentSlug,
        walletAddress: record.walletAddress,
        serviceUrl,
        maxAmount: String(maxAmount),
        response: extractJsonFromCliOutput(output),
        raw: output.slice(0, 3000),
      })
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' })
  } catch (err) {
    const error = err as Error & { stdout?: string; stderr?: string }
    const detail = [error.stdout, error.stderr, error.message].filter(Boolean).join('\n').slice(0, 1200)
    return res.status(500).json({ ok: false, error: detail || 'Circle CLI request failed.' })
  }
}
