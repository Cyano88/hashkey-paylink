import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import pg from 'pg'

type RiskMode = 'linear' | 'climb' | 'finale'
type StartRule = 'host' | 'full'
type RoomStatus = 'lobby' | 'playing' | 'completed' | 'cancelled'
type PaymentStatus = 'escrow_pending' | 'deposit_open' | 'funded' | 'settled'

type ArenaRoom = {
  roomId: string
  mode: 'private'
  game: 'trivia'
  entry: number
  players: number
  rounds: number
  riskMode: RiskMode
  timer: number
  startRule: StartRule
  status: RoomStatus
  paymentStatus: PaymentStatus
  escrowAddress: string | null
  depositAsset: 'USDC'
  platformFeeBps: number
  createdAt: string
  updatedAt: string
}

const { Pool } = pg
const DATABASE_URL = (process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? '').trim()
const PLATFORM_FEE_BPS = 50
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
    const error = new Error('Arena Postgres storage is not configured. Add DATABASE_URL on Render before creating rooms.')
    error.name = 'ArenaStorageNotConfigured'
    throw error
  }
  return pool
}

function ensureSchema() {
  if (!schemaReady) {
    schemaReady = requirePool().query(`
      create table if not exists arena_rooms (
        room_id text primary key,
        mode text not null,
        game text not null,
        entry integer not null,
        players integer not null,
        rounds integer not null,
        risk_mode text not null,
        timer integer not null,
        start_rule text not null,
        status text not null,
        payment_status text not null default 'escrow_pending',
        escrow_address text,
        deposit_asset text not null default 'USDC',
        platform_fee_bps integer not null default 50,
        state jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table arena_rooms add column if not exists payment_status text not null default 'escrow_pending';
      alter table arena_rooms add column if not exists escrow_address text;
      alter table arena_rooms add column if not exists deposit_asset text not null default 'USDC';
      alter table arena_rooms add column if not exists platform_fee_bps integer not null default 50;
      create index if not exists arena_rooms_created_at_idx on arena_rooms (created_at desc);
    `).then(() => undefined)
  }
  return schemaReady
}

function roomId() {
  return `SP-${randomBytes(3).toString('hex').toUpperCase()}`
}

function numberChoice(value: unknown, allowed: number[], fallback: number) {
  const parsed = Number(value)
  return allowed.includes(parsed) ? parsed : fallback
}

function riskChoice(value: unknown): RiskMode {
  return value === 'linear' || value === 'finale' ? value : 'climb'
}

function startRuleChoice(value: unknown): StartRule {
  return value === 'full' ? 'full' : 'host'
}

function paymentStatusChoice(value: unknown): PaymentStatus {
  if (value === 'deposit_open' || value === 'funded' || value === 'settled') return value
  return 'escrow_pending'
}

function toRoom(row: Record<string, unknown>): ArenaRoom {
  return {
    roomId: String(row.room_id),
    mode: 'private',
    game: 'trivia',
    entry: Number(row.entry),
    players: Number(row.players),
    rounds: Number(row.rounds),
    riskMode: riskChoice(row.risk_mode),
    timer: numberChoice(row.timer, [45, 60, 90], 60),
    startRule: startRuleChoice(row.start_rule),
    status: String(row.status ?? 'lobby') as RoomStatus,
    paymentStatus: paymentStatusChoice(row.payment_status),
    escrowAddress: typeof row.escrow_address === 'string' && row.escrow_address ? row.escrow_address : null,
    depositAsset: 'USDC',
    platformFeeBps: Number(row.platform_fee_bps ?? PLATFORM_FEE_BPS),
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function storageError(res: Response, error: unknown) {
  const message = error instanceof Error ? error.message : 'Arena room storage failed.'
  const status = error instanceof Error && error.name === 'ArenaStorageNotConfigured' ? 503 : 500
  console.error('[arena-room]', message)
  return res.status(status).json({ ok: false, error: message })
}

async function createRoom(req: Request, res: Response) {
  try {
    await ensureSchema()
    const body = (req.body ?? {}) as Record<string, unknown>
    const room = {
      id: roomId(),
      entry: numberChoice(body.entry, [10, 50, 200], 10),
      players: numberChoice(body.players, [2, 5, 10], 5),
      rounds: numberChoice(body.rounds, [10, 15], 15),
      riskMode: riskChoice(body.riskMode),
      timer: numberChoice(body.timer, [45, 60, 90], 60),
      startRule: startRuleChoice(body.startRule),
    }

    const result = await requirePool().query(
      `insert into arena_rooms
        (room_id, mode, game, entry, players, rounds, risk_mode, timer, start_rule, status, payment_status, deposit_asset, platform_fee_bps, state)
       values
        ($1, 'private', 'trivia', $2, $3, $4, $5, $6, $7, 'lobby', 'escrow_pending', 'USDC', $8, $9::jsonb)
       returning *`,
      [
        room.id,
        room.entry,
        room.players,
        room.rounds,
        room.riskMode,
        room.timer,
        room.startRule,
        PLATFORM_FEE_BPS,
        JSON.stringify({ joinedPlayers: 1, source: 'streampay-arena-ui', moneyMode: 'escrow_required' }),
      ],
    )

    return res.status(201).json({ ok: true, room: toRoom(result.rows[0]) })
  } catch (error) {
    return storageError(res, error)
  }
}

async function getRoom(req: Request, res: Response) {
  try {
    await ensureSchema()
    const id = String(req.query.id ?? '').trim().toUpperCase()
    if (!/^SP-[A-F0-9]{6}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid Arena room id.' })
    }

    const result = await requirePool().query('select * from arena_rooms where room_id = $1 limit 1', [id])
    if (!result.rowCount) return res.status(404).json({ ok: false, error: 'Arena room not found.' })
    return res.json({ ok: true, room: toRoom(result.rows[0]) })
  } catch (error) {
    return storageError(res, error)
  }
}

export default async function arenaRoomHandler(req: Request, res: Response) {
  if (req.method === 'POST') return createRoom(req, res)
  if (req.method === 'GET') return getRoom(req, res)
  res.setHeader('Allow', 'GET, POST')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
}
