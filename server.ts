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
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import relayV2Handler         from './api/relay-v2.js'
import relayStarknetHandler   from './api/relay-starknet.js'
import txStatusHandler        from './api/tx-status.js'
import recoverStarknetHandler from './api/recover-starknet.js'
import starkBalanceHandler    from './api/starknet-balance.js'
import solanaBalanceHandler   from './api/solana-balance.js'
import evmBalanceHandler      from './api/evm-balance.js'
import setupRelayerHandler    from './api/setup-relayer.js'
// ── Streampay module ──────────────────────────────────────────────────────────
import relayStreamHandler               from './modules/streampay/api/relay-stream.js'
import streamOgHandler                 from './modules/streampay/api/stream-og.js'
import settlePoaHandler                from './modules/streampay/api/settle-poa.js'
import { storeContent, getContent }      from './modules/streampay/api/content.js'
import { registerVault, getVault, listViewers } from './modules/streampay/api/vault-registry.js'
import { registerEventPayment, listEventPayments } from './api/event-registry.js'
import {
  buildSolanaTx, relaySolanaTx,
  getSolanaVaultAddress, sweepSolanaVault,
} from './api/relay-solana.js'
import fxRateHandler from './api/fx-rate.js'
import relayGhoHandler from './api/relay-gho.js'
import basePaymasterHandler from './api/base-paymaster.js'
import circleSolanaEmailHandler from './api/circle-solana-email.js'
import privyCircleLinkHandler from './api/privy-circle-link.js'
import circleRecipientWalletHandler from './api/circle-recipient-wallet.js'
import telegramRequestHandler from './api/telegram-request.js'
import polymarketBridgeHandler from './api/polymarket-bridge.js'
import ngPosHandler from './api/ng-pos.js'
import streamRecipientInviteHandler from './api/stream-recipient-invite.js'
import streamHistoryHandler from './api/stream-history.js'
import agenticStreamingSubscriptionHandler from './api/agentic-streaming-subscription.js'
import agenticStreamingReportHandler from './api/agentic-streaming-report.js'
import agentVerifyHandler   from './api/agent-verify.js'
import agentAskHandler     from './api/agent-ask.js'
import agentWalletHandler  from './api/agent-wallet.js'
import helperProfileHandler from './api/helper-profile.js'
import agentProfileHandler from './api/agent-profile.js'
import agentGovernanceHandler from './api/agent-governance.js'
import agentLegalProfileHandler from './api/agent-legal-profile.js'
import polyWorldcupNewsHandler from './api/poly-worldcup-news.js'
import polyStreamHandler from './api/poly-stream.js'
import x402PolymarketScoutHandler from './api/x402-polymarket-scout.js'
import x402ReceiptHandler from './api/x402-receipt.js'
import checkAgentUrlHandler from './api/check-agent-url.js'
import dashboardPaymentsHandler from './api/dashboard-payments.js'
import paymentTxLookupHandler from './api/payment-tx-lookup.js'
import { rateLimit } from './api/rate-limit.js'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

app.use((_req, res, next) => {
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https: wss:",
      "frame-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "child-src 'self' https://auth.privy.io https://pw-auth.circle.com https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join('; '),
  )
  next()
})

// Parse JSON bodies before any route handler sees req.body.
app.use(express.json({ limit: '64kb' }))

const strictLimiter = rateLimit({ name: 'strict', windowMs: 60_000, max: 20 })
const relayLimiter = rateLimit({ name: 'relay', windowMs: 60_000, max: 30 })
const readLimiter = rateLimit({ name: 'read', windowMs: 60_000, max: 120 })

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/relay-v2',              relayLimiter, relayV2Handler)
app.post('/api/relay-starknet',        relayStarknetHandler)
app.post('/api/tx-status',             txStatusHandler)
app.post('/api/starknet-balance',      starkBalanceHandler)
app.post('/api/solana-balance',        solanaBalanceHandler)
app.post('/api/evm-balance',           readLimiter, evmBalanceHandler)
app.get('/api/setup-starknet-relayer', setupRelayerHandler)
app.post('/api/recover-starknet',      recoverStarknetHandler)
// ── Streampay routes ──────────────────────────────────────────────────────────
app.post('/api/relay-stream',          relayLimiter, relayStreamHandler)
app.post('/api/settle-poa',            relayLimiter, settlePoaHandler)
app.post('/api/store-content',         strictLimiter, storeContent)
app.get('/api/get-content',            readLimiter, getContent)
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
app.all('/api/relay-gho',              relayGhoHandler)
app.all('/api/base-paymaster',         basePaymasterHandler)
app.post('/api/circle-solana-email',   circleSolanaEmailHandler)
app.post('/api/privy-circle-link',     strictLimiter, privyCircleLinkHandler)
app.all('/api/circle-recipient-wallet', strictLimiter, circleRecipientWalletHandler)
app.all('/api/telegram-request',        strictLimiter, telegramRequestHandler)
app.all('/api/polymarket-bridge',       strictLimiter, polymarketBridgeHandler)
app.all('/api/ng-pos',                  strictLimiter, ngPosHandler)
app.post('/api/stream-recipient-invite', strictLimiter, streamRecipientInviteHandler)
app.get('/api/stream-history',         readLimiter, streamHistoryHandler)
app.all('/api/agentic-streaming-subscription', strictLimiter, agenticStreamingSubscriptionHandler)
app.post('/api/agentic-streaming-report', strictLimiter, agenticStreamingReportHandler)
// ── Agentic Economy — 0G payment verification primitives ─────────────────────
app.all('/api/agent-verify',           strictLimiter, agentVerifyHandler)
app.post('/api/agent-ask',             strictLimiter, agentAskHandler)
app.all('/api/agent-wallet',           strictLimiter, agentWalletHandler)
app.all('/api/helper-profile',         strictLimiter, helperProfileHandler)
app.all('/api/agent-profile',          strictLimiter, agentProfileHandler)
app.post('/api/agent-governance',      strictLimiter, agentGovernanceHandler)
app.get('/api/agent-legal-profile',    readLimiter, agentLegalProfileHandler)
app.get('/api/poly-worldcup-news',      readLimiter, polyWorldcupNewsHandler)
app.get('/api/poly-stream',             readLimiter, polyStreamHandler)
app.get('/api/x402/polymarket-scout',  strictLimiter, x402PolymarketScoutHandler)
app.get('/api/x402/receipt',           readLimiter, x402ReceiptHandler)
app.get('/api/check-agent-url',        strictLimiter, checkAgentUrlHandler)
app.get('/api/dashboard-payments',     readLimiter, dashboardPaymentsHandler)
app.post('/api/payment-tx-lookup',     readLimiter, paymentTxLookupHandler)
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

app.use(express.static(join(__dirname, 'dist')))

// ── SPA fallback — send index.html for all non-API routes ────────────────────
app.get('*', (_req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

// ── Listen ───────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT) || 3000
app.listen(PORT, () => {
  console.log(`HashKey PayLink running on port ${PORT}`)
})
