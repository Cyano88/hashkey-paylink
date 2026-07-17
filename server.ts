/**
 * Express server for Render deployment.
 *
 * Serves:
 *   - /api/relay-v2      POST  — V2 ghost-vault relay (RELAYER_PRIVATE_KEY)
 *   - /api/relay-stream  POST  — Streampay gasless claim/cancel on Arc
 *   - /api/health        GET   — liveness probe (used by RelayerWakeUp component)
 *   - /*                       — Vite production build (dist/)
 */

import express from 'express'
import type { Response } from 'express'
import { config as loadEnv } from 'dotenv'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import relayV2Handler         from './api/relay-v2.js'
import txStatusHandler        from './api/tx-status.js'
import solanaBalanceHandler   from './api/solana-balance.js'
import evmBalanceHandler      from './api/evm-balance.js'
// ── Streampay module ──────────────────────────────────────────────────────────
import relayStreamHandler               from './modules/streampay/api/relay-stream.js'
import relayCheckpointHandler           from './modules/streampay/api/relay-checkpoint.js'
import streamOgHandler                 from './modules/streampay/api/stream-og.js'
import settlePoaHandler                from './modules/streampay/api/settle-poa.js'
import {
  storeContent,
  getContent,
  getContentStreamEscrow,
  getContentCheckpointEscrow,
  getCreatorCheckpointVault,
  saveCreatorCheckpointVault,
  getContentX402,
  listCreatorContent,
  listApprovedCreatorContent,
  listCreatorAdminContent,
  listCreatorEarnings,
  getHashpayStreamAgentContext,
  getCreatorBook,
  getCreatorSocial,
  recordCreatorContentView,
  setCreatorReaction,
  addCreatorComment,
  setCreatorCommentReaction,
  reviewCreatorContent,
  unlockContentX402WithAgent,
} from './modules/streampay/api/content.js'
import { registerVault, getVault, listViewers } from './modules/streampay/api/vault-registry.js'
import { registerEventPayment, listEventPayments } from './api/event-registry.js'
import {
  buildSolanaTx, relaySolanaTx,
  getSolanaVaultAddress, sweepSolanaVault,
} from './api/relay-solana.js'
import fxRateHandler from './api/fx-rate.js'
import relayArbitrumUsdcHandler from './api/relay-arbitrum-usdc.js'
import basePaymasterHandler from './api/base-paymaster.js'
import circleSolanaEmailHandler from './api/circle-solana-email.js'
import privyCircleLinkHandler from './api/privy-circle-link.js'
import circleRecipientWalletHandler from './api/circle-recipient-wallet.js'
import telegramRequestHandler from './api/telegram-request.js'
import polymarketBridgeHandler from './api/polymarket-bridge.js'
import polymarketBuilderHandoffHandler from './api/polymarket-builder-handoff.js'
import polymarketBuilderSignerHandler from './api/polymarket-builder-signer.js'
import polymarketOrderHandler from './api/polymarket-order.js'
import polymarketPortfolioHandler from './api/polymarket-portfolio.js'
import polymarketRelayerBuilderSignerHandler from './api/polymarket-relayer-builder-signer.js'
import polymarketSubmitOrderHandler from './api/polymarket-submit-order.js'
import ngPosHandler from './api/ng-pos.js'
import localCurrencyProfileHandler from './api/local-currency-profile.js'
import pocketProfileHandler from './api/pocket/profile.js'
import pocketPosHandler from './api/pocket/pos.js'
import pocketBankReceiveHandler from './api/pocket/bank-receive.js'
import pocketBankInstitutionsHandler from './api/pocket/bank-receive-institutions.js'
import pocketBankVerifyHandler from './api/pocket/bank-receive-verify.js'
import pocketBankSendHandler from './api/pocket/bank-send.js'
import {
  pocketSolanaTransferPrepareHandler,
  pocketSolanaTransferSubmitHandler,
} from './api/pocket/solana-transfers.js'
import pocketActivityHandler from './api/pocket/activity.js'
import pocketBalancesHandler from './api/pocket/balances.js'
import pocketFxQuoteHandler from './api/pocket/fx-quote.js'
import pocketRecipientBalanceHandler from './api/pocket/recipient-balance.js'
import pocketX402Handler from './api/pocket/x402.js'
import pocketX402ConnectHandler from './api/pocket/x402-connect.js'
import pocketX402ActivateHandler from './api/pocket/x402-activate.js'
import pocketMarketplaceHandler from './api/pocket/marketplace.js'
import pocketAgentAskHandler from './api/pocket/agent-ask.js'
import pocketWalletsHandler from './api/pocket/wallets/index.js'
import pocketWalletLinkHandler from './api/pocket/wallets/link.js'
import { paycrestWebhookHandler } from './api/paycrest-pos.js'
import streamRecipientInviteHandler from './api/stream-recipient-invite.js'
import streamHistoryHandler from './api/stream-history.js'
import arenaRoomHandler from './api/arena-room.js'
import agentVerifyHandler   from './api/agent-verify.js'
import agentAskHandler     from './api/agent-ask.js'
import agentWalletHandler  from './api/agent-wallet.js'
import helperProfileHandler from './api/helper-profile.js'
import circlePocketActionsHandler from './api/circle-pocket-actions.js'
import agentProfileHandler from './api/agent-profile.js'
import agentGovernanceHandler from './api/agent-governance.js'
import agentLegalProfileHandler from './api/agent-legal-profile.js'
import polyWorldcupNewsHandler from './api/poly-worldcup-news.js'
import polyStreamHandler from './api/poly-stream.js'
import x402PolymarketScoutHandler from './api/x402-polymarket-scout.js'
import zeroScoutPolymarketBriefHandler from './api/zeroscout-polymarket-brief.js'
import x402ReceiptHandler from './api/x402-receipt.js'
import receiptHandler from './api/receipt.js'
import checkAgentUrlHandler from './api/check-agent-url.js'
import dashboardPaymentsHandler from './api/dashboard-payments.js'
import paymentTxLookupHandler from './api/payment-tx-lookup.js'
import publicConfigHandler from './api/public-config.js'
import { rateLimit } from './api/rate-limit.js'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

const CHECKPOINT_FACTORY_ADDRESS = publicEnv(
  'VITE_CHECKPOINT_FACTORY_ADDRESS',
  'CHECKPOINT_FACTORY_ADDRESS',
) || '0x8eEc65a18f3b5deb0E9Fc5e1eCf8263587b02927'

function runtimePublicConfigScript() {
  const privyAppId = publicEnv('VITE_PRIVY_APP_ID', 'PRIVY_APP_ID')
  const authBridge = publicEnv('VITE_AUTH_BRIDGE', 'AUTH_BRIDGE') || 'legacy'
  const payload = JSON.stringify({
    auth: {
      authBridge,
      privyAppId,
      privyEnabled: Boolean(privyAppId && authBridge !== 'legacy'),
    },
    streampay: {
      checkpointFactoryAddress: CHECKPOINT_FACTORY_ADDRESS,
    },
  }).replace(/</g, '\\u003c')
  return `<script>window.__HASH_PAYLINK_CONFIG__=${payload};</script>`
}

function sendSpaIndex(res: Response) {
  const indexPath = join(__dirname, 'dist', 'index.html')
  const html = readFileSync(indexPath, 'utf8')
  res.type('html').send(html.replace('</head>', `${runtimePublicConfigScript()}</head>`))
}

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://www.youtube.com https://s.ytimg.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
      "child-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com https://www.youtube.com https://www.youtube-nocookie.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  next()
})

app.post('/api/paycrest-webhook', express.raw({ type: 'application/json', limit: '128kb' }), paycrestWebhookHandler)

// Parse JSON bodies before any route handler sees req.body. Creator Studio
// publish payloads can include sanitized article HTML plus a compressed cover.
app.use(express.json({ limit: '256kb' }))

const strictLimiter = rateLimit({ name: 'strict', windowMs: 60_000, max: 20 })
const relayLimiter = rateLimit({ name: 'relay', windowMs: 60_000, max: 30 })
const readLimiter = rateLimit({ name: 'read', windowMs: 60_000, max: 120 })
// Arena: 4s polling + question fetches + actions, often multiple players sharing a NAT IP.
// Auth-gated per-room, so a generous bucket is fine.
const arenaLimiter = rateLimit({ name: 'arena', windowMs: 60_000, max: 240 })

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/relay-v2',              relayLimiter, relayV2Handler)
app.post('/api/tx-status',             txStatusHandler)
app.post('/api/solana-balance',        solanaBalanceHandler)
app.post('/api/evm-balance',           readLimiter, evmBalanceHandler)
// ── Streampay routes ──────────────────────────────────────────────────────────
app.post('/api/relay-stream',          relayLimiter, relayStreamHandler)
app.post('/api/relay-checkpoint',      relayLimiter, relayCheckpointHandler)
app.post('/api/settle-poa',            relayLimiter, settlePoaHandler)
app.post('/api/store-content',         strictLimiter, storeContent)
app.get('/api/list-creator-content',   readLimiter, listCreatorContent)
app.get('/api/creator-earnings',       readLimiter, listCreatorEarnings)
app.get('/api/hashpaystream-agent-context', readLimiter, getHashpayStreamAgentContext)
app.get('/api/creator-discover-content', readLimiter, listApprovedCreatorContent)
app.get('/api/admin/creator-content',  strictLimiter, listCreatorAdminContent)
app.post('/api/admin/creator-content', strictLimiter, reviewCreatorContent)
app.get('/api/get-content',            readLimiter, getContent)
app.get('/api/get-content-stream',     readLimiter, getContentStreamEscrow)
app.get('/api/get-content-checkpoint', readLimiter, getContentCheckpointEscrow)
app.get('/api/creator-checkpoint-vault', readLimiter, getCreatorCheckpointVault)
app.post('/api/creator-checkpoint-vault', strictLimiter, saveCreatorCheckpointVault)
app.get('/api/get-content-x402',       readLimiter, getContentX402)
app.post('/api/creator-unlock-x402',   strictLimiter, unlockContentX402WithAgent)
app.get('/api/creator-social',         readLimiter, getCreatorSocial)
app.post('/api/creator-content-view',  strictLimiter, recordCreatorContentView)
app.post('/api/creator-social/reaction', strictLimiter, setCreatorReaction)
app.post('/api/creator-social/comment', strictLimiter, addCreatorComment)
app.post('/api/creator-social/comment-reaction', strictLimiter, setCreatorCommentReaction)
app.post('/api/register-vault',        registerVault)
app.get('/api/get-vault',              getVault)
app.get('/api/list-viewers',           listViewers)
app.post('/api/event-register',        relayLimiter, registerEventPayment)
app.get('/api/list-event-payments',    readLimiter, listEventPayments)
// ── Solana relay ──────────────────────────────────────────────────────────────
app.post('/api/solana-build-tx',       relayLimiter, buildSolanaTx)
app.post('/api/solana-relay',          relayLimiter, relaySolanaTx)
app.get('/api/solana-vault',           readLimiter, getSolanaVaultAddress)
app.post('/api/solana-sweep',          relayLimiter, sweepSolanaVault)
app.get('/api/fx-rate',                fxRateHandler)
app.all('/api/relay-arbitrum-usdc',    relayArbitrumUsdcHandler)
app.all('/api/base-paymaster',         basePaymasterHandler)
app.post('/api/circle-solana-email',   circleSolanaEmailHandler)
app.post('/api/privy-circle-link',     strictLimiter, privyCircleLinkHandler)
app.all('/api/circle-recipient-wallet', strictLimiter, circleRecipientWalletHandler)
app.all('/api/telegram-request',        strictLimiter, telegramRequestHandler)
app.all('/api/polymarket-bridge',       strictLimiter, polymarketBridgeHandler)
app.post('/api/polymarket-builder-handoff', strictLimiter, polymarketBuilderHandoffHandler)
app.post('/api/polymarket-builder-signer', strictLimiter, polymarketBuilderSignerHandler)
app.post('/api/polymarket-order',       strictLimiter, polymarketOrderHandler)
app.all('/api/polymarket-portfolio',    readLimiter,   polymarketPortfolioHandler)
app.post('/api/polymarket-relayer-builder-signer', strictLimiter, polymarketRelayerBuilderSignerHandler)
app.post('/api/polymarket-submit-order', strictLimiter, polymarketSubmitOrderHandler)
app.all('/api/ng-pos',                  strictLimiter, ngPosHandler)
app.all('/api/local-currency-profile',  strictLimiter, localCurrencyProfileHandler)
app.all('/api/pocket/profile',           strictLimiter, pocketProfileHandler)
app.all('/api/pocket/pos',               strictLimiter, pocketPosHandler)
app.all('/api/pocket/bank-receive',      strictLimiter, pocketBankReceiveHandler)
app.all('/api/pocket/bank-receive/institutions', readLimiter, pocketBankInstitutionsHandler)
app.all('/api/pocket/bank-receive/verify', strictLimiter, pocketBankVerifyHandler)
app.all('/api/pocket/bank-send',          strictLimiter, pocketBankSendHandler)
app.all('/api/pocket/transfers/prepare',  strictLimiter, pocketSolanaTransferPrepareHandler)
app.all('/api/pocket/transfers/submit',   strictLimiter, pocketSolanaTransferSubmitHandler)
app.all('/api/pocket/wallets',           readLimiter, pocketWalletsHandler)
app.all('/api/pocket/balances',          readLimiter, pocketBalancesHandler)
app.all('/api/pocket/fx-quote',          readLimiter, pocketFxQuoteHandler)
app.all('/api/pocket/balances/recipient', readLimiter, pocketRecipientBalanceHandler)
app.all('/api/pocket/activity',          readLimiter, pocketActivityHandler)
app.all('/api/pocket/x402',              readLimiter, pocketX402Handler)
app.all('/api/pocket/x402/connect',      strictLimiter, pocketX402ConnectHandler)
app.all('/api/pocket/x402/activate',     strictLimiter, pocketX402ActivateHandler)
app.all('/api/pocket/marketplace',       strictLimiter, pocketMarketplaceHandler)
app.all('/api/pocket/agent/ask',         strictLimiter, pocketAgentAskHandler)
app.all('/api/pocket/wallets/link',      strictLimiter, pocketWalletLinkHandler)
app.post('/api/stream-recipient-invite', strictLimiter, streamRecipientInviteHandler)
app.get('/api/stream-history',         readLimiter, streamHistoryHandler)
app.all('/api/arena-room',             arenaLimiter, arenaRoomHandler)
// ── Agentic Economy — 0G payment verification primitives ─────────────────────
app.all('/api/agent-verify',           strictLimiter, agentVerifyHandler)
app.post('/api/agent-ask',             strictLimiter, agentAskHandler)
app.all('/api/agent-wallet',           strictLimiter, agentWalletHandler)
app.all('/api/helper-profile',         strictLimiter, helperProfileHandler)
app.get('/api/circle-pocket-actions',  strictLimiter, circlePocketActionsHandler)
app.all('/api/agent-profile',          strictLimiter, agentProfileHandler)
app.post('/api/agent-governance',      strictLimiter, agentGovernanceHandler)
app.get('/api/agent-legal-profile',    readLimiter, agentLegalProfileHandler)
app.get('/api/poly-worldcup-news',      readLimiter, polyWorldcupNewsHandler)
app.get('/api/poly-stream',             readLimiter, polyStreamHandler)
app.get('/api/creator-book',            readLimiter, getCreatorBook)
app.get('/api/x402/polymarket-scout',  strictLimiter, x402PolymarketScoutHandler)
app.post('/api/zeroscout/polymarket-brief', strictLimiter, zeroScoutPolymarketBriefHandler)
app.get('/api/x402/receipt',           readLimiter, x402ReceiptHandler)
app.get('/api/receipt',                readLimiter, receiptHandler)
app.get('/api/check-agent-url',        strictLimiter, checkAgentUrlHandler)
app.get('/api/dashboard-payments',     readLimiter, dashboardPaymentsHandler)
app.post('/api/payment-tx-lookup',     readLimiter, paymentTxLookupHandler)
app.get('/api/public-config',          readLimiter, publicConfigHandler)
app.get('/api/health',                 (_req, res) => res.json({ ok: true, ts: Date.now() }))
// OG tag injection — must be before the SPA catch-all
app.get('/stream/:vaultAddress',       streamOgHandler)
app.get('/stream',                     streamOgHandler)

// /agent — dual-purpose: browser gets SPA, API clients get JSON verification
app.get('/agent', (req, res, next) => {
  const { eventId, payer } = req.query as Record<string, string>
  const acceptsJson = (req.headers.accept ?? '').includes('application/json')
  if (eventId && payer && acceptsJson) return agentVerifyHandler(req, res)
  next()
})

// ── Static frontend (Vite build output) ──────────────────────────────────────
// Keep API mistakes from falling through to the SPA shell. A wrong method,
// stale frontend route, or missing API mount must return JSON to callers.
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: `API route not found: ${req.method} ${req.originalUrl}` })
})

app.use(express.static(join(__dirname, 'dist'), { index: false }))

// ── SPA fallback — send index.html for all non-API routes ────────────────────
app.get('*', (_req, res) => {
  sendSpaIndex(res)
})

// ── Listen ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () => {
  console.log(`HashKey PayLink running on port ${PORT}`)
})
