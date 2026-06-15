import type { Request, Response } from 'express'
import { createHash, randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { ethers } from 'ethers'
import pg from 'pg'
import { PrivyClient } from '@privy-io/server-auth'

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
const ARC_RPC_URL = (process.env.PRIVATE_RPC_URL_ARC ?? process.env.VITE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network').trim()
const ARENA_ESCROW_FACTORY_ADDRESS = (process.env.ARENA_ESCROW_FACTORY_ADDRESS ?? '').trim()
const ARENA_RELAYER_KEY = (
  process.env.ARENA_RELAYER_PRIVATE_KEY
  ?? process.env.DEPLOYER_PRIVATE_KEY
  ?? process.env.RELAYER_PRIVATE_KEY_ARC
  ?? ''
).trim()
const ARC_USDC_DECIMALS = 6

const ARENA_FACTORY_ABI = [
  'function relayer() view returns (address)',
  'function getEscrowAddress(bytes32 roomId,address host,uint256 entryAmount,uint16 maxPlayers,uint16 rounds,uint8 riskCurve,bytes32 salt) view returns (address)',
  'function createRoom(bytes32 roomId,uint256 entryAmount,uint16 maxPlayers,uint16 rounds,uint8 riskCurve,bytes32 salt) returns (address)',
] as const
const ARENA_ESCROW_ABI = [
  'function startRoom()',
  'function eliminate(address player,uint16 roundNumber)',
  'function cancelRoom()',
  'function settleWinner(address winner)',
  'function roomInfo() view returns (uint8 status,uint16 playerCount,uint16 activeCount,uint16 currentRound,uint256 accountedDeposits,uint256 reservedRefunds,uint256 totalStreamed,address winner)',
  'function players(address) view returns (bool joined,bool active,bool refunded,uint256 streamed,uint256 refundable)',
] as const

const PRIVY_CIRCLE_LINK_STORE = (process.env.PRIVY_CIRCLE_LINK_STORE ?? './data/privy-circle-links.json').trim()

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

async function lookupLinkedArcWallet(privyUserId: string): Promise<string | null> {
  try {
    const raw = await readFile(resolvePath(PRIVY_CIRCLE_LINK_STORE), 'utf8')
    const parsed = JSON.parse(raw) as { links?: Record<string, { circleWalletAddress?: string }> }
    const record = parsed.links?.[`${privyUserId}:arc`]
    const addr = record?.circleWalletAddress
    if (!addr || !/^0x[a-fA-F0-9]{40}$/.test(addr)) return null
    return addr
  } catch {
    return null
  }
}

async function lookupRoomPlayerWallet(roomId: string, privyUserId: string): Promise<string | null> {
  try {
    const result = await requirePool().query(
      `select state -> 'players' ->> $2 as wallet from arena_rooms where room_id = $1 limit 1`,
      [roomId, privyUserId],
    )
    const addr = result.rows[0]?.wallet
    if (typeof addr === 'string' && /^0x[a-fA-F0-9]{40}$/.test(addr)) return addr
    return null
  } catch {
    return null
  }
}

async function resolvePlayerWallet(roomId: string, privyUserId: string): Promise<string | null> {
  return (await lookupRoomPlayerWallet(roomId, privyUserId)) ?? (await lookupLinkedArcWallet(privyUserId))
}

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
        host_token_hash text,
        state jsonb not null default '{}'::jsonb,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table arena_rooms add column if not exists payment_status text not null default 'escrow_pending';
      alter table arena_rooms add column if not exists escrow_address text;
      alter table arena_rooms add column if not exists deposit_asset text not null default 'USDC';
      alter table arena_rooms add column if not exists platform_fee_bps integer not null default 50;
      alter table arena_rooms add column if not exists host_token_hash text;
      create index if not exists arena_rooms_created_at_idx on arena_rooms (created_at desc);
    `).then(() => undefined)
  }
  return schemaReady
}

function roomId() {
  return `SP-${randomBytes(3).toString('hex').toUpperCase()}`
}

function hostToken() {
  return randomBytes(24).toString('base64url')
}

function tokenHash(value: string) {
  return createHash('sha256').update(value).digest('hex')
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

function normalizePrivateKey(value: string) {
  if (!value) return ''
  return value.startsWith('0x') ? value : `0x${value}`
}

function riskCurveIndex(value: RiskMode) {
  if (value === 'linear') return 0
  if (value === 'finale') return 2
  return 1
}

function canDeployArenaEscrow() {
  return /^0x[a-fA-F0-9]{40}$/.test(ARENA_ESCROW_FACTORY_ADDRESS) && !!ARENA_RELAYER_KEY
}

function requireRelayerWallet() {
  if (!ARENA_RELAYER_KEY) throw new Error('Arena relayer is not configured.')
  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL)
  return new ethers.Wallet(normalizePrivateKey(ARENA_RELAYER_KEY), provider)
}

async function deployRoomEscrow(room: {
  id: string
  entry: number
  players: number
  rounds: number
  riskMode: RiskMode
}) {
  if (!canDeployArenaEscrow()) return null

  const provider = new ethers.JsonRpcProvider(ARC_RPC_URL)
  const wallet = new ethers.Wallet(normalizePrivateKey(ARENA_RELAYER_KEY), provider)
  const factory = new ethers.Contract(ARENA_ESCROW_FACTORY_ADDRESS, ARENA_FACTORY_ABI, wallet)
  const factoryRelayer = String(await factory.relayer()).toLowerCase()

  if (factoryRelayer !== wallet.address.toLowerCase()) {
    throw new Error('Arena escrow relayer wallet does not match deployed factory relayer.')
  }

  const roomHash = ethers.id(room.id)
  const entryAmount = ethers.parseUnits(String(room.entry), ARC_USDC_DECIMALS)
  const riskCurve = riskCurveIndex(room.riskMode)
  const salt = ethers.id(`hashpaylink:arena:${room.id}:${room.entry}:${room.players}:${room.rounds}:${room.riskMode}`)
  const predicted = await factory.getEscrowAddress(roomHash, wallet.address, entryAmount, room.players, room.rounds, riskCurve, salt)
  const code = await provider.getCode(predicted)

  if (code === '0x') {
    const tx = await factory.createRoom(roomHash, entryAmount, room.players, room.rounds, riskCurve, salt)
    await tx.wait()
  }

  return String(predicted)
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
    const token = hostToken()

    const result = await requirePool().query(
      `insert into arena_rooms
        (room_id, mode, game, entry, players, rounds, risk_mode, timer, start_rule, status, payment_status, deposit_asset, platform_fee_bps, host_token_hash, state)
       values
        ($1, 'private', 'trivia', $2, $3, $4, $5, $6, $7, 'lobby', 'escrow_pending', 'USDC', $8, $9, $10::jsonb)
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
        tokenHash(token),
        JSON.stringify({ joinedPlayers: 1, source: 'streampay-arena-ui', moneyMode: 'escrow_required' }),
      ],
    )

    let savedRoom = toRoom(result.rows[0])

    try {
      const escrowAddress = await deployRoomEscrow(room)
      if (escrowAddress) {
        const update = await requirePool().query(
          `update arena_rooms
             set escrow_address = $2,
                 payment_status = 'deposit_open',
                 state = state || $3::jsonb,
                 updated_at = now()
           where room_id = $1
           returning *`,
          [
            room.id,
            escrowAddress,
            JSON.stringify({ escrowFactory: ARENA_ESCROW_FACTORY_ADDRESS, escrowDeployedAt: new Date().toISOString() }),
          ],
        )
        savedRoom = toRoom(update.rows[0])
      }
    } catch (error) {
      console.error('[arena-room] escrow deploy skipped:', error instanceof Error ? error.message : 'unknown error')
    }

    return res.status(201).json({ ok: true, room: savedRoom, hostToken: token })
  } catch (error) {
    return storageError(res, error)
  }
}

async function controlRoom(req: Request, res: Response) {
  try {
    await ensureSchema()
    const body = (req.body ?? {}) as Record<string, unknown>
    const id = String(body.roomId ?? '').trim().toUpperCase()
    const action = String(body.action ?? '').trim()

    if (!/^SP-[A-F0-9]{6}$/.test(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid Arena room id.' })
    }

    const isSelfAction = action === 'self-eliminate' || action === 'self-settle'
    const isRegister = action === 'register-player'

    const result = await requirePool().query('select * from arena_rooms where room_id = $1 limit 1', [id])
    if (!result.rowCount) return res.status(404).json({ ok: false, error: 'Arena room not found.' })
    const row = result.rows[0] as Record<string, unknown>

    if (isRegister) {
      let userId: string
      try {
        userId = await verifiedPrivyUserId(req)
      } catch (err) {
        const e = err as Error & { status?: number }
        return res.status(e.status ?? 401).json({ ok: false, error: e.message || 'Privy auth failed.' })
      }
      const wallet = String(body.wallet ?? '').trim()
      if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ ok: false, error: 'Valid wallet address is required to register.' })
      }
      const update = await requirePool().query(
        `update arena_rooms
           set state = jsonb_set(coalesce(state, '{}'::jsonb), array['players', $2], to_jsonb($3::text), true),
               updated_at = now()
         where room_id = $1
         returning room_id`,
        [id, userId, wallet],
      )
      if (!update.rowCount) return res.status(404).json({ ok: false, error: 'Arena room not found.' })
      return res.json({ ok: true })
    }

    let selfPlayerAddress: string | null = null
    if (isSelfAction) {
      let userId: string
      try {
        userId = await verifiedPrivyUserId(req)
      } catch (err) {
        const e = err as Error & { status?: number }
        return res.status(e.status ?? 401).json({ ok: false, error: e.message || 'Privy auth failed.' })
      }
      const linked = await resolvePlayerWallet(id, userId)
      if (!linked) {
        return res.status(403).json({ ok: false, error: 'No registered Arc wallet for this Privy account in this room. Deposit again or re-load the room while signed in.' })
      }
      selfPlayerAddress = linked
    } else {
      const token = String(body.hostToken ?? '').trim()
      if (!token) return res.status(401).json({ ok: false, error: 'Host control token required.' })
      if (String(row.host_token_hash ?? '') !== tokenHash(token)) {
        return res.status(403).json({ ok: false, error: 'Invalid host control token.' })
      }
    }

    const escrowAddress = String(row.escrow_address ?? '')
    if (!/^0x[a-fA-F0-9]{40}$/.test(escrowAddress)) {
      return res.status(409).json({ ok: false, error: 'Arena escrow is not deployed yet.' })
    }

    const wallet = requireRelayerWallet()
    const escrow = new ethers.Contract(escrowAddress, ARENA_ESCROW_ABI, wallet)
    let tx
    let nextStatus: RoomStatus | null = null
    let nextPaymentStatus: PaymentStatus | null = null

    if (action === 'start') {
      tx = await escrow.startRoom()
      nextStatus = 'playing'
      nextPaymentStatus = 'funded'
    } else if (action === 'cancel') {
      tx = await escrow.cancelRoom()
      nextStatus = 'cancelled'
    } else if (action === 'eliminate') {
      const player = String(body.player ?? '')
      const roundNumber = Number(body.roundNumber)
      if (!/^0x[a-fA-F0-9]{40}$/.test(player) || !Number.isInteger(roundNumber) || roundNumber < 1) {
        return res.status(400).json({ ok: false, error: 'Valid player and roundNumber are required.' })
      }
      tx = await escrow.eliminate(player, roundNumber)
      nextStatus = 'playing'
    } else if (action === 'settle') {
      const winner = String(body.winner ?? '')
      if (!/^0x[a-fA-F0-9]{40}$/.test(winner)) {
        return res.status(400).json({ ok: false, error: 'Valid winner address is required.' })
      }
      tx = await escrow.settleWinner(winner)
      nextStatus = 'completed'
      nextPaymentStatus = 'settled'
    } else if (action === 'self-eliminate' && selfPlayerAddress) {
      const roundNumber = Number(body.roundNumber)
      if (!Number.isInteger(roundNumber) || roundNumber < 1) {
        return res.status(400).json({ ok: false, error: 'Valid roundNumber required for self-eliminate.' })
      }
      const info = await escrow.players(selfPlayerAddress)
      if (!info[0]) return res.status(409).json({ ok: false, error: 'Linked wallet has not joined this room.' })
      if (!info[1]) return res.status(409).json({ ok: false, error: 'Player is already inactive on-chain.' })
      tx = await escrow.eliminate(selfPlayerAddress, roundNumber)
      nextStatus = 'playing'
    } else if (action === 'self-settle' && selfPlayerAddress) {
      const info = await escrow.players(selfPlayerAddress)
      if (!info[0] || !info[1]) return res.status(409).json({ ok: false, error: 'Linked wallet is not an active player.' })
      tx = await escrow.settleWinner(selfPlayerAddress)
      nextStatus = 'completed'
      nextPaymentStatus = 'settled'
    } else {
      return res.status(400).json({ ok: false, error: 'Unsupported Arena room action.' })
    }

    const receipt = await tx.wait()
    const roomInfo = await escrow.roomInfo()
    const statePatch = {
      lastAction: action,
      lastActionTx: receipt?.hash ?? tx.hash,
      lastActionAt: new Date().toISOString(),
      chainStatus: Number(roomInfo[0]),
      playerCount: Number(roomInfo[1]),
      activeCount: Number(roomInfo[2]),
      currentRound: Number(roomInfo[3]),
    }

    const update = await requirePool().query(
      `update arena_rooms
         set status = coalesce($2, status),
             payment_status = coalesce($3, payment_status),
             state = state || $4::jsonb,
             updated_at = now()
       where room_id = $1
       returning *`,
      [id, nextStatus, nextPaymentStatus, JSON.stringify(statePatch)],
    )

    return res.json({
      ok: true,
      room: toRoom(update.rows[0]),
      txHash: receipt?.hash ?? tx.hash,
      chain: statePatch,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Arena room action failed.'
    console.error('[arena-room-control]', message)
    return res.status(500).json({ ok: false, error: message.slice(0, 240) })
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
  if (req.method === 'PATCH') return controlRoom(req, res)
  if (req.method === 'GET') return getRoom(req, res)
  res.setHeader('Allow', 'GET, POST, PATCH')
  return res.status(405).json({ ok: false, error: 'Method not allowed.' })
}
