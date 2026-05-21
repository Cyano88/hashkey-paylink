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
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import relayV2Handler         from './api/relay-v2.js'
import relayStarknetHandler   from './api/relay-starknet.js'
import txStatusHandler        from './api/tx-status.js'
import recoverStarknetHandler from './api/recover-starknet.js'
import starkBalanceHandler    from './api/starknet-balance.js'
import solanaBalanceHandler   from './api/solana-balance.js'
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
import circleRecipientWalletHandler from './api/circle-recipient-wallet.js'
import streamRecipientInviteHandler from './api/stream-recipient-invite.js'
import streamHistoryHandler from './api/stream-history.js'
import agentVerifyHandler   from './api/agent-verify.js'
import agentAskHandler     from './api/agent-ask.js'
import agentWalletHandler  from './api/agent-wallet.js'
import x402PolymarketScoutHandler from './api/x402-polymarket-scout.js'
import checkAgentUrlHandler from './api/check-agent-url.js'
import dashboardPaymentsHandler from './api/dashboard-payments.js'
import { rateLimit } from './api/rate-limit.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

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
app.all('/api/circle-recipient-wallet', strictLimiter, circleRecipientWalletHandler)
app.post('/api/stream-recipient-invite', strictLimiter, streamRecipientInviteHandler)
app.get('/api/stream-history',         readLimiter, streamHistoryHandler)
// ── Agentic Economy — 0G payment verification primitives ─────────────────────
app.all('/api/agent-verify',           strictLimiter, agentVerifyHandler)
app.post('/api/agent-ask',             strictLimiter, agentAskHandler)
app.all('/api/agent-wallet',           strictLimiter, agentWalletHandler)
app.get('/api/x402/polymarket-scout',  strictLimiter, x402PolymarketScoutHandler)
app.get('/api/check-agent-url',        strictLimiter, checkAgentUrlHandler)
app.get('/api/dashboard-payments',     readLimiter, dashboardPaymentsHandler)
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
