/**
 * stream-og.ts
 *
 * Intercepts GET /stream/:vaultAddress before the SPA catch-all and injects
 * dynamic OpenGraph meta tags so that pasted stream links look great on
 * X (Twitter), WhatsApp, iMessage, and Slack.
 *
 * Example OG output:
 *   <meta property="og:title"       content="Streampay: Active USDC Stream for 0xa2…1d66" />
 *   <meta property="og:description" content="50.00 USDC streaming · 14d 6h remaining · Powered by Hash PayLink on Arc" />
 *   <meta property="og:image"       content="https://…/og-streampay.png" />
 *
 * Mount in server.ts (before the SPA fallback):
 *   app.get('/stream/:vaultAddress', streamOgHandler)
 *   app.get('/stream',               streamOgHandler)
 */

import type { Request, Response } from 'express'
import { readFileSync }           from 'fs'
import { join, dirname }          from 'path'
import { fileURLToPath }          from 'url'
import {
  createPublicClient,
  http,
  isAddress,
  defineChain,
  parseAbi,
} from 'viem'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Arc RPC (public — no key needed for read-only calls) ─────────────────────
const arc = defineChain({
  id:             5042002,
  name:           'Arc Testnet',
  nativeCurrency: { decimals: 18, name: 'USD Coin', symbol: 'USDC' },
  rpcUrls:        { default: { http: ['https://rpc.testnet.arc.network'] } },
})

const rpc = process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network'
const publicClient = createPublicClient({ chain: arc, transport: http(rpc) })

const VAULT_ABI = parseAbi([
  'function streamInfo() view returns (address _sender, address _recipient, uint256 _totalAmount, uint64 _startTime, uint64 _endTime, uint256 _alreadyWithdrawn, bool _cancelled, uint256 _unlocked, uint256 _claimable)',
])

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatUsdc(raw: bigint): string {
  const whole = Number(raw / 1_000_000n)
  const frac  = Number(raw % 1_000_000n)
  return `${whole.toLocaleString('en-US')}.${String(frac).padStart(6, '0').slice(0, 2)}`
}

function timeRemaining(endTime: bigint): string {
  const now  = BigInt(Math.floor(Date.now() / 1000))
  const diff = Number(endTime - now)
  if (diff <= 0) return 'stream complete'
  const days  = Math.floor(diff / 86400)
  const hours = Math.floor((diff % 86400) / 3600)
  if (days > 0) return `${days}d ${hours}h remaining`
  return `${hours}h remaining`
}

// ── Default (fallback) OG values ──────────────────────────────────────────────

const DEFAULT_OG = {
  title:       'Streampay — Real-time USDC Streaming on Arc',
  description: 'Send and receive USDC in real-time, second by second. Gasless. No signup. Powered by Hash PayLink.',
  image:       '/og-streampay.png',
}

// ── HTML injection ────────────────────────────────────────────────────────────

function injectOgTags(
  html: string,
  title: string,
  description: string,
  image: string,
  url: string,
): string {
  const origin = process.env.RENDER_EXTERNAL_URL
    ?? process.env.VITE_APP_URL
    ?? 'https://hashkey-paylink.onrender.com'

  const tags = `
  <!-- Streampay dynamic OG tags -->
  <meta property="og:type"        content="website" />
  <meta property="og:site_name"   content="Hash PayLink · Streampay" />
  <meta property="og:title"       content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image"       content="${origin}${image}" />
  <meta property="og:url"         content="${origin}${url}" />
  <meta name="twitter:card"        content="summary_large_image" />
  <meta name="twitter:site"        content="@Hash_PayLink" />
  <meta name="twitter:title"       content="${title}" />
  <meta name="twitter:description" content="${description}" />
  <meta name="twitter:image"       content="${origin}${image}" />
  <!-- /Streampay OG tags -->`

  // Replace the generic <title> and inject OG tags before </head>
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace('</head>', `${tags}\n</head>`)
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function streamOgHandler(req: Request, res: Response) {
  // Read from path param or query param
  const rawVault = (req.params.vaultAddress ?? req.query.vault ?? '') as string
  const url      = req.originalUrl

  // Locate the SPA shell
  const indexPath = join(__dirname, '../../../dist/index.html')
  let html: string
  try {
    html = readFileSync(indexPath, 'utf-8')
  } catch {
    // dist not built yet (dev mode) — just pass through
    return res.sendFile(indexPath)
  }

  // If no vault address or invalid — serve with default OG tags
  if (!rawVault || !isAddress(rawVault)) {
    return res.send(injectOgTags(
      html, DEFAULT_OG.title, DEFAULT_OG.description, DEFAULT_OG.image, url,
    ))
  }

  const vault = rawVault as `0x${string}`

  // Fetch live stream data for dynamic OG content
  try {
    const raw = await publicClient.readContract({
      address:      vault,
      abi:          VAULT_ABI,
      functionName: 'streamInfo',
    })

    // viem returns named-tuple returns as a readonly labeled tuple; cast via unknown
    const info = raw as unknown as {
      _sender: `0x${string}`; _recipient: `0x${string}`
      _totalAmount: bigint;   _endTime: bigint
      _cancelled: boolean
    }
    const { _sender, _recipient, _totalAmount, _endTime, _cancelled } = info

    const status      = _cancelled ? 'Cancelled'
      : BigInt(Math.floor(Date.now() / 1000)) >= _endTime ? 'Complete'
      : 'Active'

    const title = `Streampay: ${status} USDC Stream for ${shortAddr(_recipient)}`
    const desc  = [
      `${formatUsdc(_totalAmount)} USDC total`,
      _cancelled ? 'stream cancelled' : timeRemaining(_endTime),
      `From ${shortAddr(_sender)}`,
      'Powered by Hash PayLink on Arc',
    ].join(' · ')

    return res.send(injectOgTags(html, title, desc, DEFAULT_OG.image, url))
  } catch {
    // Vault not deployed or RPC error — fall back to defaults
    return res.send(injectOgTags(
      html, DEFAULT_OG.title, DEFAULT_OG.description, DEFAULT_OG.image, url,
    ))
  }
}
