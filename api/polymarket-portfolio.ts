import type { Request, Response } from 'express'
import pg from 'pg'
import { isAddress } from 'viem'
import { PrivyClient } from '@privy-io/server-auth'

const DATA_API_ORIGIN = 'https://data-api.polymarket.com'
const REQUEST_TIMEOUT_MS = 10_000

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const pool = DATABASE_URL
  ? new Pool({
      connectionString: DATABASE_URL,
      ssl: DATABASE_URL.includes('localhost') || DATABASE_URL.includes('127.0.0.1')
        ? false
        : { rejectUnauthorized: false },
    })
  : null

let schemaReady: Promise<void> | null = null

function requirePool() {
  if (!pool) {
    const err = new Error('Polymarket portfolio storage is not configured. Add DATABASE_URL on Render.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  return pool
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = requirePool().query(`
      create table if not exists polymarket_profiles (
        privy_user_id text primary key,
        polymarket_address text not null,
        preferred_funding_network text not null default 'base',
        last_synced_at timestamptz,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists polymarket_alert_settings (
        privy_user_id text primary key references polymarket_profiles(privy_user_id) on delete cascade,
        loss_threshold_percent integer not null default 20,
        resolved_alerts_enabled boolean not null default true,
        claimable_alerts_enabled boolean not null default true,
        movement_alerts_enabled boolean not null default false,
        updated_at timestamptz not null default now()
      );

      create table if not exists polymarket_watchlist (
        id serial primary key,
        privy_user_id text not null,
        market_id text not null,
        market_slug text,
        market_url text,
        label text,
        created_at timestamptz not null default now(),
        unique (privy_user_id, market_id)
      );

      create table if not exists polymarket_funding_attempts (
        id serial primary key,
        privy_user_id text not null,
        polymarket_address text not null,
        request_id text,
        network text not null,
        amount text not null,
        status text not null,
        tx_hash text,
        deposit_address text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );

      create table if not exists polymarket_alert_history (
        id serial primary key,
        privy_user_id text not null,
        alert_type text not null,
        market_id text,
        title text not null,
        body text,
        severity text not null default 'info',
        source_snapshot jsonb,
        created_at timestamptz not null default now(),
        read_at timestamptz
      );

      create index if not exists polymarket_funding_attempts_user_idx
        on polymarket_funding_attempts (privy_user_id, created_at desc);
      create index if not exists polymarket_alert_history_user_idx
        on polymarket_alert_history (privy_user_id, created_at desc);
      create index if not exists polymarket_watchlist_user_idx
        on polymarket_watchlist (privy_user_id);
    `).then(() => undefined)
  }
  return schemaReady
}

function bearerToken(req: Request): string | undefined {
  const auth = req.headers.authorization ?? ''
  const match = auth.match(/^Bearer\s+(.+)$/i)
  return match?.[1]
}

async function verifiedPrivyUserId(req: Request): Promise<string> {
  const privyAppId = process.env.PRIVY_APP_ID ?? process.env.VITE_PRIVY_APP_ID
  const privyAppSecret = process.env.PRIVY_APP_SECRET
  if (!privyAppId || !privyAppSecret) {
    const err = new Error('Privy is not configured. Set PRIVY_APP_ID and PRIVY_APP_SECRET on the server.')
    ;(err as Error & { status?: number }).status = 503
    throw err
  }
  const token = bearerToken(req)
  if (!token) {
    const err = new Error('Missing Privy access token.')
    ;(err as Error & { status?: number }).status = 401
    throw err
  }
  const client = new PrivyClient(privyAppId, privyAppSecret)
  const claims = await client.verifyAuthToken(token)
  return claims.userId
}

function cleanString(value: unknown, max = 96) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanAmount(value: unknown) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (!/^\d+(?:\.\d{1,6})?$/.test(raw)) return ''
  return raw
}

const SUPPORTED_NETWORKS = new Set(['base', 'arbitrum', 'solana'])

async function dataApiFetch<T>(path: string): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${DATA_API_ORIGIN}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    if (!response.ok) {
      const message = typeof data === 'object' && data && 'error' in data
        ? String((data as { error?: unknown }).error)
        : text.slice(0, 160)
      throw new Error(message || `Polymarket data-api HTTP ${response.status}`)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

type PolymarketPosition = {
  conditionId?: string
  asset?: string
  market?: string
  eventSlug?: string
  slug?: string
  title?: string
  icon?: string
  outcome?: string
  size?: number
  avgPrice?: number
  currentValue?: number
  cashPnl?: number
  percentPnl?: number
  redeemable?: boolean
  endDate?: string
  curPrice?: number
}

async function loadProfileBundle(privyUserId: string) {
  await ensureSchema()
  const profile = (await requirePool().query(
    'select * from polymarket_profiles where privy_user_id = $1 limit 1',
    [privyUserId],
  )).rows[0]
  if (!profile) {
    return { profile: null, settings: null, watchlist: [], fundingAttempts: [], alerts: [] }
  }
  const [settingsRes, watchRes, fundRes, alertsRes] = await Promise.all([
    requirePool().query('select * from polymarket_alert_settings where privy_user_id = $1 limit 1', [privyUserId]),
    requirePool().query('select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc', [privyUserId]),
    requirePool().query('select * from polymarket_funding_attempts where privy_user_id = $1 order by created_at desc limit 25', [privyUserId]),
    requirePool().query('select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 50', [privyUserId]),
  ])
  return {
    profile: {
      polymarketAddress: profile.polymarket_address as string,
      preferredFundingNetwork: profile.preferred_funding_network as string,
      lastSyncedAt: profile.last_synced_at instanceof Date ? profile.last_synced_at.toISOString() : null,
      createdAt: profile.created_at instanceof Date ? profile.created_at.toISOString() : null,
    },
    settings: settingsRes.rows[0]
      ? {
          lossThresholdPercent: Number(settingsRes.rows[0].loss_threshold_percent),
          resolvedAlertsEnabled: Boolean(settingsRes.rows[0].resolved_alerts_enabled),
          claimableAlertsEnabled: Boolean(settingsRes.rows[0].claimable_alerts_enabled),
          movementAlertsEnabled: Boolean(settingsRes.rows[0].movement_alerts_enabled),
        }
      : { lossThresholdPercent: 20, resolvedAlertsEnabled: true, claimableAlertsEnabled: true, movementAlertsEnabled: false },
    watchlist: watchRes.rows.map(row => ({
      id: Number(row.id),
      marketId: String(row.market_id),
      marketSlug: row.market_slug ? String(row.market_slug) : null,
      marketUrl: row.market_url ? String(row.market_url) : null,
      label: row.label ? String(row.label) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    })),
    fundingAttempts: fundRes.rows.map(row => ({
      id: Number(row.id),
      requestId: row.request_id ? String(row.request_id) : null,
      network: String(row.network),
      amount: String(row.amount),
      status: String(row.status),
      txHash: row.tx_hash ? String(row.tx_hash) : null,
      depositAddress: row.deposit_address ? String(row.deposit_address) : null,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
    })),
    alerts: alertsRes.rows.map(row => ({
      id: Number(row.id),
      alertType: String(row.alert_type),
      marketId: row.market_id ? String(row.market_id) : null,
      title: String(row.title),
      body: row.body ? String(row.body) : null,
      severity: String(row.severity),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : null,
      readAt: row.read_at instanceof Date ? row.read_at.toISOString() : null,
    })),
  }
}

async function evaluateAlerts(privyUserId: string, address: string) {
  await ensureSchema()
  const settingsRow = (await requirePool().query(
    'select * from polymarket_alert_settings where privy_user_id = $1 limit 1',
    [privyUserId],
  )).rows[0]
  if (!settingsRow) return 0
  const lossThreshold = Number(settingsRow.loss_threshold_percent)
  const claimableEnabled = Boolean(settingsRow.claimable_alerts_enabled)
  const resolvedEnabled = Boolean(settingsRow.resolved_alerts_enabled)

  let positions: PolymarketPosition[] = []
  try {
    positions = await dataApiFetch<PolymarketPosition[]>(`/positions?user=${encodeURIComponent(address)}&sizeThreshold=1&limit=100`)
    if (!Array.isArray(positions)) positions = []
  } catch {
    return 0
  }

  let inserted = 0
  for (const position of positions) {
    const marketId = cleanString(position.conditionId ?? position.market ?? position.asset, 96)
    if (!marketId) continue
    const title = cleanString(position.title ?? position.slug ?? 'Polymarket position', 160)

    if (claimableEnabled && position.redeemable) {
      const insert = await requirePool().query(
        `insert into polymarket_alert_history (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot)
         select $1,'claimable',$2,$3,$4,'success',$5::jsonb
         where not exists (
           select 1 from polymarket_alert_history
           where privy_user_id = $1 and alert_type = 'claimable' and market_id = $2 and read_at is null
         )
         returning id`,
        [privyUserId, marketId, `Claimable: ${title}`,
          `This position is redeemable on Polymarket.`,
          JSON.stringify(position)],
      )
      inserted += insert.rowCount ?? 0
    }

    const percentPnl = typeof position.percentPnl === 'number' ? position.percentPnl : null
    if (percentPnl !== null && percentPnl <= -Math.abs(lossThreshold)) {
      const insert = await requirePool().query(
        `insert into polymarket_alert_history (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot)
         select $1,'loss-threshold',$2,$3,$4,'warning',$5::jsonb
         where not exists (
           select 1 from polymarket_alert_history
           where privy_user_id = $1 and alert_type = 'loss-threshold' and market_id = $2
           and created_at > now() - interval '24 hours'
         )
         returning id`,
        [privyUserId, marketId, `Down ${Math.round(percentPnl)}%: ${title}`,
          `Position dropped below your ${lossThreshold}% loss threshold.`,
          JSON.stringify(position)],
      )
      inserted += insert.rowCount ?? 0
    }

    if (resolvedEnabled && typeof position.endDate === 'string' && position.endDate) {
      const ended = new Date(position.endDate).getTime()
      if (Number.isFinite(ended) && ended < Date.now() && !position.redeemable) {
        const insert = await requirePool().query(
          `insert into polymarket_alert_history (privy_user_id, alert_type, market_id, title, body, severity, source_snapshot)
           select $1,'resolved',$2,$3,$4,'info',$5::jsonb
           where not exists (
             select 1 from polymarket_alert_history
             where privy_user_id = $1 and alert_type = 'resolved' and market_id = $2
           )
           returning id`,
          [privyUserId, marketId, `Market resolved: ${title}`,
            `This market closed and your position is no longer redeemable.`,
            JSON.stringify(position)],
        )
        inserted += insert.rowCount ?? 0
      }
    }
  }

  await requirePool().query(
    'update polymarket_profiles set last_synced_at = now(), updated_at = now() where privy_user_id = $1',
    [privyUserId],
  )
  return inserted
}

export default async function handler(req: Request, res: Response) {
  try {
    const queryAction = cleanString(req.query.action, 32).toLowerCase()
    const bodyAction = req.method === 'POST' ? cleanString((req.body ?? {}).action, 32).toLowerCase() : ''
    const action = bodyAction || queryAction

    // Public proxy actions — no auth required, used for live read.
    if (req.method === 'GET' && action === 'value') {
      const address = cleanString(req.query.address, 64)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      const data = await dataApiFetch<unknown>(`/value?user=${encodeURIComponent(address)}`)
      return res.json({ ok: true, value: data })
    }
    if (req.method === 'GET' && action === 'positions') {
      const address = cleanString(req.query.address, 64)
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      const sizeThreshold = cleanString(req.query.sizeThreshold, 12) || '1'
      const limit = cleanString(req.query.limit, 6) || '50'
      const url = `/positions?user=${encodeURIComponent(address)}&sizeThreshold=${encodeURIComponent(sizeThreshold)}&limit=${encodeURIComponent(limit)}`
      const data = await dataApiFetch<unknown>(url)
      return res.json({ ok: true, positions: Array.isArray(data) ? data : [] })
    }

    // All persistence actions require Privy auth.
    let privyUserId: string
    try {
      privyUserId = await verifiedPrivyUserId(req)
    } catch (err) {
      const e = err as Error & { status?: number }
      return res.status(e.status ?? 401).json({ ok: false, error: e.message || 'Privy auth failed.' })
    }

    await ensureSchema()

    if (req.method === 'GET' && (action === 'profile' || action === '')) {
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (req.method === 'GET' && action === 'funding-attempts') {
      const rows = (await requirePool().query(
        'select * from polymarket_funding_attempts where privy_user_id = $1 order by created_at desc limit 50',
        [privyUserId],
      )).rows
      return res.json({ ok: true, fundingAttempts: rows })
    }

    if (req.method === 'GET' && action === 'alert-history') {
      const rows = (await requirePool().query(
        'select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 100',
        [privyUserId],
      )).rows
      return res.json({ ok: true, alerts: rows })
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method not allowed' })
    }

    const body = (req.body ?? {}) as Record<string, unknown>

    if (action === 'save-profile') {
      const address = cleanString(body.address, 64)
      const network = cleanString(body.fundingNetwork, 12) || 'base'
      if (!isAddress(address)) return res.status(400).json({ ok: false, error: 'Provide a valid 0x Polymarket address.' })
      if (!SUPPORTED_NETWORKS.has(network)) return res.status(400).json({ ok: false, error: 'Unsupported funding network.' })
      await requirePool().query(
        `insert into polymarket_profiles (privy_user_id, polymarket_address, preferred_funding_network)
         values ($1,$2,$3)
         on conflict (privy_user_id) do update set
           polymarket_address = excluded.polymarket_address,
           preferred_funding_network = excluded.preferred_funding_network,
           updated_at = now()`,
        [privyUserId, address, network],
      )
      await requirePool().query(
        `insert into polymarket_alert_settings (privy_user_id) values ($1)
         on conflict (privy_user_id) do nothing`,
        [privyUserId],
      )
      const bundle = await loadProfileBundle(privyUserId)
      return res.json({ ok: true, ...bundle })
    }

    if (action === 'disconnect') {
      await requirePool().query('delete from polymarket_watchlist where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_funding_attempts where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_alert_history where privy_user_id = $1', [privyUserId])
      await requirePool().query('delete from polymarket_profiles where privy_user_id = $1', [privyUserId])
      return res.json({ ok: true, profile: null, settings: null, watchlist: [], fundingAttempts: [], alerts: [] })
    }

    if (action === 'save-alert-settings') {
      const loss = Math.max(1, Math.min(95, Math.round(Number(body.lossThresholdPercent ?? 20))))
      const resolved = Boolean(body.resolvedAlertsEnabled)
      const claimable = Boolean(body.claimableAlertsEnabled)
      const movement = Boolean(body.movementAlertsEnabled)
      const profileExists = (await requirePool().query('select 1 from polymarket_profiles where privy_user_id = $1', [privyUserId])).rowCount
      if (!profileExists) return res.status(409).json({ ok: false, error: 'Save a Polymarket profile address first.' })
      await requirePool().query(
        `insert into polymarket_alert_settings
          (privy_user_id, loss_threshold_percent, resolved_alerts_enabled, claimable_alerts_enabled, movement_alerts_enabled)
         values ($1,$2,$3,$4,$5)
         on conflict (privy_user_id) do update set
           loss_threshold_percent = excluded.loss_threshold_percent,
           resolved_alerts_enabled = excluded.resolved_alerts_enabled,
           claimable_alerts_enabled = excluded.claimable_alerts_enabled,
           movement_alerts_enabled = excluded.movement_alerts_enabled,
           updated_at = now()`,
        [privyUserId, loss, resolved, claimable, movement],
      )
      return res.json({
        ok: true,
        settings: {
          lossThresholdPercent: loss,
          resolvedAlertsEnabled: resolved,
          claimableAlertsEnabled: claimable,
          movementAlertsEnabled: movement,
        },
      })
    }

    if (action === 'add-watch') {
      const marketId = cleanString(body.marketId, 96)
      if (!marketId) return res.status(400).json({ ok: false, error: 'marketId is required.' })
      const profileExists = (await requirePool().query('select 1 from polymarket_profiles where privy_user_id = $1', [privyUserId])).rowCount
      if (!profileExists) return res.status(409).json({ ok: false, error: 'Save a Polymarket profile address first.' })
      const marketSlug = cleanString(body.marketSlug, 160) || null
      const marketUrl = cleanString(body.marketUrl, 280) || null
      const label = cleanString(body.label, 80) || null
      await requirePool().query(
        `insert into polymarket_watchlist (privy_user_id, market_id, market_slug, market_url, label)
         values ($1,$2,$3,$4,$5)
         on conflict (privy_user_id, market_id) do update set
           market_slug = excluded.market_slug,
           market_url = excluded.market_url,
           label = excluded.label`,
        [privyUserId, marketId, marketSlug, marketUrl, label],
      )
      const rows = (await requirePool().query(
        'select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc',
        [privyUserId],
      )).rows
      return res.json({ ok: true, watchlist: rows })
    }

    if (action === 'remove-watch') {
      const marketId = cleanString(body.marketId, 96)
      if (!marketId) return res.status(400).json({ ok: false, error: 'marketId is required.' })
      await requirePool().query(
        'delete from polymarket_watchlist where privy_user_id = $1 and market_id = $2',
        [privyUserId, marketId],
      )
      const rows = (await requirePool().query(
        'select * from polymarket_watchlist where privy_user_id = $1 order by created_at desc',
        [privyUserId],
      )).rows
      return res.json({ ok: true, watchlist: rows })
    }

    if (action === 'log-funding') {
      const network = cleanString(body.network, 12)
      if (!SUPPORTED_NETWORKS.has(network)) return res.status(400).json({ ok: false, error: 'Unsupported funding network.' })
      const amount = cleanAmount(body.amount)
      if (!amount) return res.status(400).json({ ok: false, error: 'Provide a valid funding amount.' })
      const status = cleanString(body.status, 24) || 'pending'
      const requestId = cleanString(body.requestId, 64) || null
      const txHash = cleanString(body.txHash, 96) || null
      const depositAddress = cleanString(body.depositAddress, 96) || null
      const profileRow = (await requirePool().query(
        'select polymarket_address from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      if (!profileRow) return res.status(409).json({ ok: false, error: 'Save a Polymarket profile address first.' })
      const inserted = await requirePool().query(
        `insert into polymarket_funding_attempts
          (privy_user_id, polymarket_address, request_id, network, amount, status, tx_hash, deposit_address)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         returning id, request_id, network, amount, status, tx_hash, deposit_address, created_at`,
        [privyUserId, String(profileRow.polymarket_address), requestId, network, amount, status, txHash, depositAddress],
      )
      return res.json({ ok: true, fundingAttempt: inserted.rows[0] })
    }

    if (action === 'mark-alert-read') {
      const alertId = Number(body.alertId)
      if (!Number.isInteger(alertId) || alertId <= 0) return res.status(400).json({ ok: false, error: 'alertId is required.' })
      await requirePool().query(
        'update polymarket_alert_history set read_at = now() where id = $1 and privy_user_id = $2',
        [alertId, privyUserId],
      )
      return res.json({ ok: true })
    }

    if (action === 'evaluate-alerts') {
      const profileRow = (await requirePool().query(
        'select polymarket_address from polymarket_profiles where privy_user_id = $1',
        [privyUserId],
      )).rows[0]
      if (!profileRow) return res.status(409).json({ ok: false, error: 'Save a Polymarket profile address first.' })
      const inserted = await evaluateAlerts(privyUserId, String(profileRow.polymarket_address))
      const rows = (await requirePool().query(
        'select * from polymarket_alert_history where privy_user_id = $1 order by created_at desc limit 50',
        [privyUserId],
      )).rows
      return res.json({ ok: true, insertedCount: inserted, alerts: rows })
    }

    return res.status(400).json({ ok: false, error: `Unknown action: ${action}` })
  } catch (err) {
    const e = err as Error & { status?: number }
    return res.status(e.status ?? 500).json({ ok: false, error: e.message || 'Polymarket portfolio request failed' })
  }
}
