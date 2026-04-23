/**
 * Express server for Render deployment.
 *
 * Serves:
 *   - /api/relay-v2      POST  — V2 ghost-vault relay (RELAYER_PRIVATE_KEY)
 *   - /api/sweep         POST  — immediate single-router sweep (KEEPER_PRIVATE_KEY)
 *   - /api/sweep-keeper  GET   — batch sweep keeper (hit by external cron)
 *   - /*                       — Vite production build (dist/)
 */

import express from 'express'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import relayV2Handler       from './api/relay-v2.js'
import relayStarknetHandler from './api/relay-starknet.js'
import starkBalanceHandler  from './api/starknet-balance.js'
import sweepHandler         from './api/sweep.js'
import keeperHandler        from './api/sweep-keeper.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// Parse JSON bodies before any route handler sees req.body.
app.use(express.json())

// ── API routes ────────────────────────────────────────────────────────────────
app.post('/api/relay-v2',          relayV2Handler)
app.post('/api/relay-starknet',    relayStarknetHandler)
app.post('/api/starknet-balance',  starkBalanceHandler)
app.all('/api/sweep',              sweepHandler)       // frontend uses POST; cron can use GET
app.get('/api/sweep-keeper',       keeperHandler)

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
