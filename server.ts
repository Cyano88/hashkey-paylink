/**
 * Express server for Render deployment.
 *
 * Serves:
 *   - /api/relay-v2      POST  — V2 ghost-vault relay (RELAYER_PRIVATE_KEY)
 *   - /api/sweep         POST  — immediate single-router sweep (KEEPER_PRIVATE_KEY)
 *   - /api/sweep-keeper  GET   — batch sweep keeper (hit by external cron)
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
import setupRelayerHandler    from './api/setup-relayer.js'
import sweepHandler           from './api/sweep.js'
import keeperHandler          from './api/sweep-keeper.js'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// Parse JSON bodies before any route handler sees req.body.
app.use(express.json())

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/relay-v2',              relayV2Handler)
app.post('/api/relay-starknet',        relayStarknetHandler)
app.post('/api/tx-status',             txStatusHandler)
app.post('/api/starknet-balance',      starkBalanceHandler)
app.get('/api/setup-starknet-relayer', setupRelayerHandler)
app.post('/api/recover-starknet',      recoverStarknetHandler)
app.all('/api/sweep',                  sweepHandler)       // frontend uses POST; cron can use GET
app.get('/api/sweep-keeper',           keeperHandler)
// ── Streampay routes ──────────────────────────────────────────────────────────
app.post('/api/relay-stream',          relayStreamHandler)
app.post('/api/settle-poa',            settlePoaHandler)
app.post('/api/store-content',         storeContent)
app.get('/api/get-content',            getContent)
app.post('/api/register-vault',        registerVault)
app.get('/api/get-vault',              getVault)
app.get('/api/list-viewers',           listViewers)
app.post('/api/event-register',        registerEventPayment)
app.get('/api/list-event-payments',    listEventPayments)
// ── Solana relay ──────────────────────────────────────────────────────────────
app.post('/api/solana-build-tx',       buildSolanaTx)
app.post('/api/solana-relay',          relaySolanaTx)
app.get('/api/solana-vault',           getSolanaVaultAddress)
app.post('/api/solana-sweep',          sweepSolanaVault)
app.get('/api/fx-rate',                fxRateHandler)
app.all('/api/relay-gho',              relayGhoHandler)
app.get('/api/health',                 (_req, res) => res.json({ ok: true, ts: Date.now() }))
// OG tag injection — must be before the SPA catch-all
app.get('/stream/:vaultAddress',       streamOgHandler)
app.get('/stream',                     streamOgHandler)

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
