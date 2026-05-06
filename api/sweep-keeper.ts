/**
 * Backend keeper — auto-sweeps USDC from every deployed PaymentRouter on Base.
 *
 * Discovers routers dynamically by scanning the factory's RouterDeployed events,
 * so no manual config is needed when new payment links are created.
 *
 * Triggered by an external cron (cron-job.org, free) hitting:
 *   GET https://hashkey-paylink.onrender.com/api/sweep-keeper?secret=<CRON_SECRET>
 *
 * Required env vars (Render dashboard → Environment → Environment Variables):
 *   KEEPER_PRIVATE_KEY  — 0x-prefixed private key; wallet needs Base ETH for gas only
 *   CRON_SECRET         — any random string; authenticates cron requests
 *   FACTORY_FROM_BLOCK  — (optional) block the factory was deployed at; defaults to 29500000
 */

import type { Request, Response } from 'express'
import { createPublicClient, createWalletClient, http, parseAbi } from 'viem'
import { base } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'

// ─── Config ──────────────────────────────────────────────────────────────────

const FACTORY = '0x163c3B1695e439d20D99Bb344554c5B64965c446' as const
const USDC    = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

// Block the factory was deployed — avoids scanning from genesis.
// Set FACTORY_FROM_BLOCK env var to the exact deployment block for efficiency.
const FACTORY_FROM_BLOCK = BigInt(process.env.FACTORY_FROM_BLOCK ?? '29500000')

// ─── ABIs ─────────────────────────────────────────────────────────────────────

const FACTORY_ABI = parseAbi([
  'event RouterDeployed(address indexed recipient, address indexed router)',
])
const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
])
const ROUTER_ABI = parseAbi([
  'function sweep(address token) external',
])

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  // Auth check
  const cronSecret  = process.env.CRON_SECRET
  const authHeader  = req.headers['authorization'] ?? ''
  const querySecret = Array.isArray(req.query.secret) ? req.query.secret[0] : req.query.secret

  const authorized =
    (cronSecret && authHeader === `Bearer ${cronSecret}`) ||
    (cronSecret && querySecret === cronSecret)

  if (!authorized) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const rawKey = process.env.KEEPER_PRIVATE_KEY
  if (!rawKey) return res.status(500).json({ error: 'KEEPER_PRIVATE_KEY not set' })

  const account      = privateKeyToAccount(rawKey as `0x${string}`)
  const publicClient = createPublicClient({ chain: base, transport: http() })
  const walletClient = createWalletClient({ chain: base, transport: http(), account })

  // ── Step 1: discover all deployed routers from factory events ─────────────
  const logs = await publicClient.getLogs({
    address: FACTORY,
    event: FACTORY_ABI[0],           // RouterDeployed(address,address)
    fromBlock: FACTORY_FROM_BLOCK,
    toBlock: 'latest',
  })

  if (logs.length === 0) {
    return res.status(200).json({ ok: true, message: 'no routers deployed yet', results: [] })
  }

  // Deduplicate by router address (idempotent deploys emit one event each)
  const routers = [...new Map(
    logs.map(l => [l.args.router, { recipient: l.args.recipient!, router: l.args.router! }])
  ).values()]

  // ── Step 2: check each router and sweep if funded ─────────────────────────
  const results: Record<string, unknown>[] = []

  for (const { recipient, router } of routers) {
    const balance = await publicClient.readContract({
      address: USDC,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [router],
    })

    if (balance === 0n) {
      results.push({ recipient, router, balance: '0', status: 'empty' })
      continue
    }

    try {
      const hash = await walletClient.writeContract({
        address: router,
        abi: ROUTER_ABI,
        functionName: 'sweep',
        args: [USDC],
      })
      results.push({
        recipient,
        router,
        balance: (Number(balance) / 1e6).toFixed(6) + ' USDC',
        status: 'swept',
        tx: hash,
      })
    } catch (err) {
      results.push({
        recipient,
        router,
        balance: (Number(balance) / 1e6).toFixed(6) + ' USDC',
        status: 'sweep_failed',
        reason: err instanceof Error ? err.message.slice(0, 120) : String(err),
      })
    }
  }

  const swept = results.filter(r => r.status === 'swept').length
  return res.status(200).json({ ok: true, routersFound: routers.length, swept, results })
}
