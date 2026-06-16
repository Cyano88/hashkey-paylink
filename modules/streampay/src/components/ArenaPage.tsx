import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeft, Check, Clock3, Copy, Crown, LockKeyhole, Play, RotateCcw, Settings, Share2, Sparkles, Trophy, Users, WalletCards } from 'lucide-react'
import { createPublicClient, formatUnits, http, parseUnits, type Address } from 'viem'
import { arcChain, CHAIN_META } from '../../../../src/lib/chains'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  sendCircleArcArenaJoin,
  sendCircleArcArenaRefund,
  type CircleEvmEmailSession,
} from '../../../../src/lib/circleEvmEmailWallet'
import { PRIVY_AUTH_ENABLED } from '../../../../src/lib/authMode'
import { resolvePrivyCircleLink, savePrivyCircleLink } from '../../../../src/lib/privyCircleLink'

type RiskMode = 'linear' | 'climb' | 'finale'
type RoomStatus = 'setup' | 'lobby' | 'playing' | 'eliminated' | 'won'
type ArenaTab = 'room' | 'how' | 'settings'
type ArenaView = 'games' | 'list' | 'private'
type MyRoomSummary = SavedArenaRoom & { role: 'host' | 'player' }
type StartRule = 'host' | 'full'
type PaymentStatus = 'escrow_pending' | 'deposit_open' | 'funded' | 'settled'

type SavedArenaRoom = {
  roomId: string
  name?: string | null
  entry: number
  players: number
  rounds: number
  riskMode: RiskMode
  timer: number
  startRule: StartRule
  status: 'lobby' | 'playing' | 'completed' | 'cancelled'
  paymentStatus: PaymentStatus
  escrowAddress: string | null
  depositAsset: 'USDC'
  platformFeeBps: number
}

function readInitialArenaView(): ArenaView {
  if (typeof window === 'undefined') return 'games'
  const params = new URLSearchParams(window.location.search)
  if (params.get('game') !== 'trivia') return 'games'
  const roomParam = String(params.get('room') ?? '').trim()
  return roomParam ? 'private' : 'list'
}

function readInitialRoomId() {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  if (params.get('game') !== 'trivia') return ''
  const roomParam = String(params.get('room') ?? '').trim().toUpperCase()
  return /^SP-[A-F0-9]{6}$/.test(roomParam) ? roomParam : ''
}

function readInitialRoomStatus(): RoomStatus {
  // If the URL points at a saved room id, render the lobby card on the very
  // first paint so we never flash the create-form before loadSavedRoom
  // resolves. Real status is reconciled once the GET response arrives.
  if (typeof window === 'undefined') return 'setup'
  const params = new URLSearchParams(window.location.search)
  if (params.get('game') !== 'trivia') return 'setup'
  const roomParam = String(params.get('room') ?? '').trim().toUpperCase()
  return /^SP-[A-F0-9]{6}$/.test(roomParam) ? 'lobby' : 'setup'
}

const ENTRY_OPTIONS = [10, 50, 200]
const PLAYER_OPTIONS = [2, 5, 10]
const ROUND_OPTIONS = [10, 15]
const TIMER_OPTIONS = [45, 60, 90]

const ENTRY_BOUNDS = { min: 1, max: 1000 }
const PLAYERS_BOUNDS = { min: 2, max: 20 }
const ROUNDS_BOUNDS = { min: 5, max: 30 }
const TIMER_BOUNDS = { min: 15, max: 180 }

function inRange(n: number, bounds: { min: number; max: number }) {
  return Number.isFinite(n) && n >= bounds.min && n <= bounds.max
}
const PLATFORM_FEE_BPS = 50
const ARC_PUBLIC_CLIENT = createPublicClient({ chain: arcChain, transport: http() })
const ARC_USDC_ADDRESS = CHAIN_META.arc.tokenAddress
const ARC_USDC_DECIMALS = CHAIN_META.arc.decimals
const USDC_BALANCE_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const
const ARENA_ESCROW_ABI = [
  {
    name: 'playerCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint16' }],
  },
  {
    name: 'activeCount',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'count', type: 'uint16' }],
  },
  {
    name: 'players',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'player', type: 'address' }],
    outputs: [
      { name: 'joined', type: 'bool' },
      { name: 'active', type: 'bool' },
      { name: 'refunded', type: 'bool' },
      { name: 'streamed', type: 'uint256' },
      { name: 'refundable', type: 'uint256' },
    ],
  },
] as const

type ServedQuestion = { prompt: string; options: string[] }

function riskLabel(mode: RiskMode) {
  if (mode === 'linear') return 'Linear'
  if (mode === 'climb') return 'Climb'
  return 'Finale'
}

function roundWeight(round: number, totalRounds: number, mode: RiskMode) {
  if (mode === 'linear') return 1 / totalRounds
  if (mode === 'climb') {
    const denominator = (totalRounds * (totalRounds + 1)) / 2
    return round / denominator
  }
  const denominator = Array.from({ length: totalRounds }, (_, index) => Math.pow(index + 1, 1.55))
    .reduce((sum, value) => sum + value, 0)
  return Math.pow(round, 1.55) / denominator
}

function streamedThrough(round: number, totalRounds: number, mode: RiskMode, entry: number) {
  const completed = Math.max(0, Math.min(round, totalRounds))
  const ratio = Array.from({ length: completed }, (_, index) => roundWeight(index + 1, totalRounds, mode))
    .reduce((sum, value) => sum + value, 0)
  return Math.min(entry, entry * ratio)
}

function money(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function cleanEmail(value: string) {
  return value.trim().toLowerCase()
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(value))
}

function emailFromPrivyUser(user: unknown) {
  if (!user || typeof user !== 'object') return ''
  const record = user as Record<string, unknown>
  const directEmail = record.email
  if (directEmail && typeof directEmail === 'object') {
    const address = (directEmail as Record<string, unknown>).address
    if (typeof address === 'string') return address
  }
  for (const key of ['google', 'apple']) {
    const provider = record[key]
    if (provider && typeof provider === 'object') {
      const email = (provider as Record<string, unknown>).email
      if (typeof email === 'string') return email
    }
  }
  return ''
}

function shortAddress(value: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) return value
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function formatCompactUsdc(value: bigint) {
  const formatted = Number(formatUnits(value, ARC_USDC_DECIMALS))
  if (!Number.isFinite(formatted)) return '0'
  return formatted.toLocaleString(undefined, { maximumFractionDigits: formatted >= 1 ? 2 : 6 })
}

function hostStorageKey(roomId: string) {
  return `hashpaylink:arena:host:${roomId}`
}

function readHostControlToken(roomId: string) {
  if (typeof window === 'undefined' || !roomId) return ''
  return window.localStorage.getItem(hostStorageKey(roomId)) ?? ''
}

function saveHostControlToken(roomId: string, token: string) {
  if (typeof window === 'undefined' || !roomId || !token) return
  window.localStorage.setItem(hostStorageKey(roomId), token)
}

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function ArenaPage() {
  const { authenticated: privyAuthenticated, user: privyUser, login: loginPrivy, logout: logoutPrivy, getAccessToken } = usePrivy()
  const privyEmail = cleanEmail(emailFromPrivyUser(privyUser))
  const [entry, setEntry] = useState(10)
  const [players, setPlayers] = useState(5)
  const [rounds, setRounds] = useState(15)
  const [riskMode, setRiskMode] = useState<RiskMode>('climb')
  const [status, setStatus] = useState<RoomStatus>(() => readInitialRoomStatus())
  const [round, setRound] = useState(1)
  const [seconds, setSeconds] = useState(60)
  const [roomTimer, setRoomTimer] = useState(60)
  const [startRule, setStartRule] = useState<StartRule>('host')
  const [selected, setSelected] = useState('')
  const [roomLog, setRoomLog] = useState('Room preview ready')
  const [activeTab, setActiveTab] = useState<ArenaTab>('room')
  const [copied, setCopied] = useState(false)
  const [view, setView] = useState<ArenaView>(() => readInitialArenaView())
  const [savedRoomId, setSavedRoomId] = useState(() => readInitialRoomId())
  const [roomSaving, setRoomSaving] = useState(false)
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('escrow_pending')
  const [escrowAddress, setEscrowAddress] = useState<string | null>(null)
  const [platformFeeBps, setPlatformFeeBps] = useState(PLATFORM_FEE_BPS)
  const [circleEmail, setCircleEmail] = useState('')
  const [circleSession, setCircleSession] = useState<CircleEvmEmailSession | null>(null)
  const [circleBalance, setCircleBalance] = useState<bigint | null>(null)
  const [chainPlayerCount, setChainPlayerCount] = useState<number | null>(null)
  const [chainActiveCount, setChainActiveCount] = useState<number | null>(null)
  const [playerJoined, setPlayerJoined] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)
  const [joinTxHash, setJoinTxHash] = useState('')
  const [joinError, setJoinError] = useState('')
  const [linkedCircleAddress, setLinkedCircleAddress] = useState('')
  const [privyCircleLinkError, setPrivyCircleLinkError] = useState('')
  const [hostControlToken, setHostControlToken] = useState('')
  const [roomActionBusy, setRoomActionBusy] = useState('')
  const [roomActionTxHash, setRoomActionTxHash] = useState('')
  const [playerActive, setPlayerActive] = useState(false)
  const [playerRefunded, setPlayerRefunded] = useState(false)
  const [playerStreamed, setPlayerStreamed] = useState<bigint | null>(null)
  const [playerRefundable, setPlayerRefundable] = useState<bigint | null>(null)
  const [claimBusy, setClaimBusy] = useState(false)
  const [claimTxHash, setClaimTxHash] = useState('')
  const [refreshBusy, setRefreshBusy] = useState(false)
  const [walletCopied, setWalletCopied] = useState(false)
  const [activeQuestion, setActiveQuestion] = useState<ServedQuestion | null>(null)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [answerBusy, setAnswerBusy] = useState(false)
  const [roomName, setRoomName] = useState('')
  const [savedRoomName, setSavedRoomName] = useState<string | null>(null)
  const [isHostFromServer, setIsHostFromServer] = useState(false)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [myRooms, setMyRooms] = useState<MyRoomSummary[]>([])
  const [myRoomsLoading, setMyRoomsLoading] = useState(false)
  const [myRoomsError, setMyRoomsError] = useState('')

  const maxPool = entry * players
  const platformFee = (maxPool * platformFeeBps) / 10000
  const netPrize = Math.max(maxPool - platformFee, 0)
  const currentStreamed = streamedThrough(round - 1, rounds, riskMode, entry)
  const nextRoundCost = entry * roundWeight(round, rounds, riskMode)
  const remaining = Math.max(entry - currentStreamed, 0)
  const prizePool = currentStreamed * players
  const draftRoomCode = useMemo(() => `SP-${entry}${players}${rounds}-${riskMode.slice(0, 2).toUpperCase()}`, [entry, players, riskMode, rounds])
  const roomCode = savedRoomId || draftRoomCode
  const joinedPlayers = chainPlayerCount ?? (status === 'setup' ? 0 : 0)
  const canStartGame = joinedPlayers >= 2 && (startRule === 'host' || joinedPlayers >= players)
  const canHostControl = Boolean(savedRoomId) && (isHostFromServer || Boolean(hostControlToken))
  const canOpenDeposits = Boolean(escrowAddress) && paymentStatus !== 'escrow_pending'
  const circleAvailable = canUseCircleEvmEmailWallet('arc')
  const privyReady = !PRIVY_AUTH_ENABLED || privyAuthenticated
  const walletEmail = PRIVY_AUTH_ENABLED ? privyEmail : circleEmail.trim()
  const canClaimRefund = Boolean(
    playerJoined &&
    !playerActive &&
    !playerRefunded &&
    playerRefundable !== null &&
    playerRefundable > 0n &&
    escrowAddress,
  )
  const riskProgress = Math.min(100, Math.round((currentStreamed / entry) * 100))
  const alivePlayers = status === 'playing' ? Math.max(1, players - Math.floor(round / 4)) : status === 'eliminated' ? players - 1 : players
  const lobbySettingsValid = inRange(entry, ENTRY_BOUNDS) && inRange(players, PLAYERS_BOUNDS) && inRange(rounds, ROUNDS_BOUNDS) && inRange(roomTimer, TIMER_BOUNDS)
  const privateUrl = useMemo(() => {
    const origin = typeof window === 'undefined' ? 'https://hashpaylink.com' : window.location.origin
    if (savedRoomId) {
      const savedParams = new URLSearchParams({
        app: 'streampay',
        game: 'trivia',
        room: savedRoomId,
      })
      return `${origin}/arena?${savedParams.toString()}`
    }

    const params = new URLSearchParams({
      app: 'streampay',
      game: 'trivia',
      room: 'private',
      entry: String(entry),
      players: String(players),
      rounds: String(rounds),
      risk: riskMode,
    })
    return `${origin}/arena?${params.toString()}`
  }, [entry, players, riskMode, rounds, savedRoomId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('game') !== 'trivia') return

    const roomParam = String(params.get('room') ?? '').trim().toUpperCase()

    if (/^SP-[A-F0-9]{6}$/.test(roomParam)) {
      void loadSavedRoom(roomParam)
      return
    }

    if (roomParam !== 'PRIVATE') return

    const entryParam = Number(params.get('entry'))
    const playersParam = Number(params.get('players'))
    const roundsParam = Number(params.get('rounds'))
    const riskParam = params.get('risk') as RiskMode | null

    if (inRange(entryParam, ENTRY_BOUNDS)) setEntry(Math.floor(entryParam))
    if (inRange(playersParam, PLAYERS_BOUNDS)) setPlayers(Math.floor(playersParam))
    if (inRange(roundsParam, ROUNDS_BOUNDS)) setRounds(Math.floor(roundsParam))
    if (riskParam && ['linear', 'climb', 'finale'].includes(riskParam)) setRiskMode(riskParam)

    setView('private')
    setActiveTab('room')
    setStatus('setup')
    setRound(1)
    setSeconds(60)
    setSelected('')
    setSavedRoomId('')
    setPaymentStatus('escrow_pending')
    setEscrowAddress(null)
    setRoomLog('Private room loaded. Create a saved lobby before deposits open.')
  }, [])

  async function loadSavedRoom(roomId: string, quiet = false) {
    try {
      const headers: Record<string, string> = {}
      if (PRIVY_AUTH_ENABLED) {
        try {
          const token = await getAccessToken()
          if (token) headers.Authorization = `Bearer ${token}`
        } catch {
          // best effort
        }
      }
      const response = await fetch(`/api/arena-room?id=${encodeURIComponent(roomId)}`, { headers })
      const data = await response.json() as { ok?: boolean; room?: SavedArenaRoom; isHost?: boolean; error?: string }
      if (!response.ok || !data.ok || !data.room) throw new Error(data.error ?? 'Arena room not found.')
      const room = data.room
      const hadEscrow = Boolean(escrowAddress)
      setEntry(room.entry)
      setPlayers(room.players)
      setRounds(room.rounds)
      setRiskMode(room.riskMode)
      setRoomTimer(room.timer)
      setStartRule(room.startRule)
      setSavedRoomId(room.roomId)
      setSavedRoomName(room.name ?? null)
      setHostControlToken(readHostControlToken(room.roomId))
      setIsHostFromServer(Boolean(data.isHost))
      setPaymentStatus(room.paymentStatus ?? 'escrow_pending')
      setEscrowAddress(room.escrowAddress ?? null)
      setPlatformFeeBps(Number.isFinite(room.platformFeeBps) ? room.platformFeeBps : PLATFORM_FEE_BPS)
      setView('private')
      setActiveTab('room')
      // Map server room status to local status. Terminal states (won /
      // eliminated) are never reversed. Other transitions:
      //   server lobby     -> local lobby
      //   server playing   -> local playing (from lobby/setup)
      //   server completed -> local eliminated (game ended for everyone; the
      //                        actual winner already got 'won' from their own
      //                        submit-answer response, so anyone whose status
      //                        is still 'playing' here did not win)
      //   server cancelled -> local eliminated (refund path)
      const serverStatus = room.status
      let transitionedToPlaying = false
      let transitionedToEnded = false
      setStatus(prev => {
        if (prev === 'won' || prev === 'eliminated') return prev
        if (serverStatus === 'completed' || serverStatus === 'cancelled') {
          transitionedToEnded = true
          return 'eliminated'
        }
        if (serverStatus === 'playing') {
          if (prev !== 'playing') transitionedToPlaying = true
          return 'playing'
        }
        if (prev === 'playing') return prev
        return 'lobby'
      })
      if (!quiet) {
        setRound(1)
        setSeconds(room.timer)
      } else if (transitionedToPlaying) {
        setRound(1)
        setSeconds(room.timer)
      }
      setSelected('')
      if (transitionedToEnded && serverStatus === 'cancelled') {
        setRoomLog('Room cancelled by the host. Claim any remaining USDC.')
      } else if (transitionedToEnded && serverStatus === 'completed') {
        setRoomLog('Game over — another player claimed the prize. Claim any remaining USDC.')
      } else if (transitionedToPlaying) {
        setRoomLog('Game started. Loading round question...')
      } else if (!quiet || (!hadEscrow && room.escrowAddress)) {
        setRoomLog(room.escrowAddress ? 'Private room loaded. Players can deposit into the room escrow.' : 'Private room loaded. Escrow is still pending.')
      }
    } catch (error) {
      // Quiet polls must never destroy in-flight lobby/play state. A single
      // transient backend hiccup (cold start, 5xx, network blip) would
      // otherwise yank the user back to the setup form and discard their
      // saved room id.
      if (!quiet) {
        setView('private')
        setActiveTab('room')
        setStatus('setup')
        setRoomLog(error instanceof Error ? error.message : 'Arena room could not be loaded.')
      }
    }
  }

  async function fetchMyRooms() {
    if (!PRIVY_AUTH_ENABLED || !privyAuthenticated) {
      setMyRooms([])
      return
    }
    setMyRoomsLoading(true)
    setMyRoomsError('')
    try {
      const token = await Promise.race<string | null>([
        getAccessToken(),
        new Promise<null>(resolve => window.setTimeout(() => resolve(null), 3000)),
      ])
      if (!token) {
        setMyRooms([])
        return
      }
      const response = await fetch('/api/arena-room?mine=true', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json() as { ok?: boolean; rooms?: MyRoomSummary[]; error?: string }
      if (!response.ok || !data.ok || !Array.isArray(data.rooms)) {
        setMyRoomsError(data.error ?? 'Could not load your rooms.')
        return
      }
      setMyRooms(data.rooms)
    } catch (error) {
      setMyRoomsError(error instanceof Error ? error.message.slice(0, 180) : 'Could not load your rooms.')
    } finally {
      setMyRoomsLoading(false)
    }
  }

  useEffect(() => {
    if (view !== 'list') return
    void fetchMyRooms()
    // Poll my-rooms while on the list so a room state change (started /
    // completed / cancelled) reflects without manual refresh.
    const interval = window.setInterval(() => { void fetchMyRooms() }, 5000)
    return () => window.clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, privyAuthenticated])

  async function refreshSavedRoom() {
    if (!savedRoomId || refreshBusy) return
    setRefreshBusy(true)
    try {
      await loadSavedRoom(savedRoomId)
      if (circleSession?.wallet.address) await refreshRoomChainState(circleSession.wallet.address)
    } finally {
      setRefreshBusy(false)
    }
  }

  async function copyArenaWalletAddress() {
    const address = circleSession?.wallet.address || linkedCircleAddress
    if (!address) return
    try {
      await navigator.clipboard.writeText(address)
      setWalletCopied(true)
      window.setTimeout(() => setWalletCopied(false), 1600)
    } catch {
      setWalletCopied(false)
    }
  }

  async function registerArenaPlayer(walletAddress: string) {
    if (!savedRoomId || !PRIVY_AUTH_ENABLED) return
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) return
    try {
      const token = await getAccessToken()
      if (!token) return
      await fetch('/api/arena-room', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId: savedRoomId, action: 'register-player', wallet: walletAddress }),
      })
    } catch {
      // Best-effort; self-eliminate falls back to the privy-link store.
    }
  }

  async function refreshRoomChainState(walletAddress = circleSession?.wallet.address) {
    if (!escrowAddress || !/^0x[a-fA-F0-9]{40}$/.test(escrowAddress)) return
    try {
      const [playerCountRaw, activeCountRaw] = await Promise.all([
        ARC_PUBLIC_CLIENT.readContract({
          address: escrowAddress as Address,
          abi: ARENA_ESCROW_ABI,
          functionName: 'playerCount',
        }),
        ARC_PUBLIC_CLIENT.readContract({
          address: escrowAddress as Address,
          abi: ARENA_ESCROW_ABI,
          functionName: 'activeCount',
        }),
      ])
      setChainPlayerCount(Number(playerCountRaw))
      setChainActiveCount(Number(activeCountRaw))

      if (walletAddress && /^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
        const [balanceRaw, playerRaw] = await Promise.all([
          ARC_PUBLIC_CLIENT.readContract({
            address: ARC_USDC_ADDRESS,
            abi: USDC_BALANCE_ABI,
            functionName: 'balanceOf',
            args: [walletAddress as Address],
          }),
          ARC_PUBLIC_CLIENT.readContract({
            address: escrowAddress as Address,
            abi: ARENA_ESCROW_ABI,
            functionName: 'players',
            args: [walletAddress as Address],
          }),
        ])
        setCircleBalance(balanceRaw)
        const onChainJoined = Boolean(playerRaw[0])
        const onChainActive = Boolean(playerRaw[1])
        setPlayerJoined(onChainJoined)
        setPlayerActive(onChainActive)
        setPlayerRefunded(Boolean(playerRaw[2]))
        setPlayerStreamed(playerRaw[3])
        setPlayerRefundable(playerRaw[4])
        // If the chain says this wallet is no longer active but local UI is
        // still in 'playing' mode (round timer / question card), the player
        // was eliminated in an earlier round we missed. Flip them to the
        // eliminated end-state so they see Claim instead of the dead
        // question card.
        if (onChainJoined && !onChainActive) {
          setStatus(prev => (prev === 'playing' ? 'eliminated' : prev))
        }
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message.slice(0, 180) : 'Could not refresh Arena escrow.')
    }
  }

  useEffect(() => {
    if (!escrowAddress || status === 'setup') return
    void refreshRoomChainState()
    const interval = window.setInterval(() => {
      void refreshRoomChainState()
    }, 8000)
    return () => window.clearInterval(interval)
  }, [escrowAddress, status])

  useEffect(() => {
    if (!savedRoomId) return
    if (status !== 'lobby' && status !== 'playing') return
    // Poll while in lobby or playing. In lobby this catches escrow deployment
    // and the host pressing Start. In playing this catches another player
    // winning the room (status -> 'completed' server-side) or the host
    // cancelling. Stops on terminal states (won / eliminated).
    const interval = window.setInterval(() => {
      void loadSavedRoom(savedRoomId, true)
    }, 4000)
    return () => window.clearInterval(interval)
  }, [savedRoomId, status])

  useEffect(() => {
    if (!circleSession?.wallet.address || !escrowAddress) return
    void refreshRoomChainState(circleSession.wallet.address)
    void registerArenaPlayer(circleSession.wallet.address)
  }, [circleSession?.wallet.address, escrowAddress, savedRoomId])

  useEffect(() => {
    if (status !== 'playing' || !savedRoomId) {
      setActiveQuestion(null)
      return
    }
    let cancelled = false
    setQuestionLoading(true)
    setActiveQuestion(null)
    void fetch(`/api/arena-room?id=${encodeURIComponent(savedRoomId)}&round=${round}`)
      .then(r => r.json())
      .then((data: { ok?: boolean; prompt?: string; options?: string[]; error?: string }) => {
        if (cancelled) return
        if (data.ok && data.prompt && Array.isArray(data.options)) {
          setActiveQuestion({ prompt: data.prompt, options: data.options })
        } else {
          setRoomLog(data.error ?? 'Could not load round question.')
        }
      })
      .catch(() => {
        if (!cancelled) setRoomLog('Could not load round question.')
      })
      .finally(() => {
        if (!cancelled) setQuestionLoading(false)
      })
    return () => { cancelled = true }
  }, [status, round, savedRoomId])

  async function rememberPrivyCircleSession(session: CircleEvmEmailSession, email = walletEmail) {
    if (!PRIVY_AUTH_ENABLED || !privyAuthenticated) return
    try {
      const token = await getAccessToken()
      if (!token) return
      await savePrivyCircleLink({
        accessToken: token,
        chain: 'arc',
        purpose: 'payment',
        email: cleanEmail(email),
        wallet: {
          id: session.wallet.id,
          address: session.wallet.address,
          blockchain: session.wallet.blockchain,
        },
      })
      setLinkedCircleAddress(session.wallet.address)
      setPrivyCircleLinkError('')
    } catch (error) {
      setPrivyCircleLinkError(error instanceof Error ? error.message.slice(0, 160) : 'Wallet connected, but the saved link was not updated.')
    }
  }

  async function disconnectArenaWallet() {
    setCircleSession(null)
    setCircleBalance(null)
    setLinkedCircleAddress('')
    setPlayerJoined(false)
    setPlayerActive(false)
    setPlayerRefunded(false)
    setPlayerStreamed(null)
    setPlayerRefundable(null)
    setJoinTxHash('')
    setClaimTxHash('')
    setJoinError('')
    setPrivyCircleLinkError('')
    setJoinBusy(false)
    setClaimBusy(false)
    setCircleEmail('')
    if (!PRIVY_AUTH_ENABLED) {
      return
    }
    try {
      await logoutPrivy()
    } catch {
      setJoinError('Signed out locally. Refresh if your email sign-in still shows the previous account.')
    }
  }

  useEffect(() => {
    if (!circleAvailable || !PRIVY_AUTH_ENABLED) return
    if (privyEmail) setCircleEmail(current => current || privyEmail)
  }, [circleAvailable, privyEmail])

  useEffect(() => {
    if (!circleAvailable || !PRIVY_AUTH_ENABLED || !privyAuthenticated) return
    let cancelled = false

    async function restorePrivyCircleLink() {
      try {
        const token = await getAccessToken()
        if (!token) return
        const data = await resolvePrivyCircleLink({
          accessToken: token,
          chain: 'arc',
          purpose: 'payment',
        })
        if (cancelled) return
        if (data.email) setCircleEmail(current => current || data.email || privyEmail)
        if (data.link?.circleWalletAddress) setLinkedCircleAddress(data.link.circleWalletAddress)
      } catch (error) {
        if (!cancelled) {
          console.warn('[Arena] Privy Circle wallet link restore failed', error)
          setPrivyCircleLinkError('')
        }
      }
    }

    void restorePrivyCircleLink()
    return () => {
      cancelled = true
    }
  }, [circleAvailable, privyAuthenticated, privyEmail, getAccessToken])

  useEffect(() => {
    if (status !== 'playing') return
    setSeconds(roomTimer)
    const timer = window.setInterval(() => {
      setSeconds(value => {
        if (value <= 1) {
          window.clearInterval(timer)
          void submitAnswer('__TIMEOUT__')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [roomTimer, round, status])

  useEffect(() => {
    if (!cancelConfirm) return
    const t = window.setTimeout(() => setCancelConfirm(false), 4000)
    return () => window.clearTimeout(t)
  }, [cancelConfirm])

  async function createLobby() {
    setRoomSaving(true)
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (PRIVY_AUTH_ENABLED) {
        try {
          // Privy's getAccessToken can hang silently when the session is in
          // an in-between state. Cap it at 3s so the Create button can never
          // freeze the room creation flow waiting on auth metadata.
          const accessToken = await Promise.race<string | null>([
            getAccessToken(),
            new Promise<null>(resolve => window.setTimeout(() => resolve(null), 3000)),
          ])
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`
        } catch {
          // best effort — falls back to legacy hostToken model
        }
      }
      const cleanName = roomName.trim().slice(0, 60)
      const response = await fetch('/api/arena-room', {
        method: 'POST',
        headers,
        body: JSON.stringify({ entry, players, rounds, riskMode, timer: roomTimer, startRule, name: cleanName || undefined }),
      })
      const data = await response.json() as { ok?: boolean; room?: SavedArenaRoom; hostToken?: string; error?: string }
      if (!response.ok || !data.ok || !data.room) throw new Error(data.error ?? 'Arena room could not be saved.')

      setSavedRoomId(data.room.roomId)
      setSavedRoomName(data.room.name ?? null)
      if (data.hostToken) {
        saveHostControlToken(data.room.roomId, data.hostToken)
        setHostControlToken(data.hostToken)
      }
      // Privy-bound creators are isHost on the server; mirror locally so canHostControl flips on.
      if (headers.Authorization) setIsHostFromServer(true)
      setPaymentStatus(data.room.paymentStatus ?? 'escrow_pending')
      setEscrowAddress(data.room.escrowAddress ?? null)
      setPlatformFeeBps(Number.isFinite(data.room.platformFeeBps) ? data.room.platformFeeBps : PLATFORM_FEE_BPS)
      setStatus('lobby')
      setRound(1)
      setSeconds(roomTimer)
      setSelected('')
      setChainPlayerCount(0)
      setChainActiveCount(0)
      setPlayerJoined(false)
      setRoomLog(data.room.escrowAddress ? 'Private lobby saved. Share the room link; deposits are open.' : 'Private lobby saved. Escrow is still being prepared.')

      // Persist the room id into the URL so a refresh / back / tab reload
      // re-mounts directly into the saved room instead of the setup form.
      if (typeof window !== 'undefined') {
        try {
          const url = new URL(window.location.href)
          url.searchParams.set('app', 'streampay')
          url.searchParams.set('game', 'trivia')
          url.searchParams.set('room', data.room.roomId)
          url.searchParams.delete('entry')
          url.searchParams.delete('players')
          url.searchParams.delete('rounds')
          url.searchParams.delete('risk')
          window.history.replaceState(null, '', url.toString())
        } catch {
          // non-fatal; the saved room id stays in component state
        }
      }
    } catch (error) {
      setRoomLog(error instanceof Error ? error.message : 'Arena room could not be saved.')
    } finally {
      setRoomSaving(false)
    }
  }

  async function controlRoom(action: 'start' | 'cancel' | 'eliminate' | 'settle', params: Record<string, unknown> = {}) {
    if (!savedRoomId || !canHostControl) {
      setRoomLog('Only the room creator can control this private room.')
      return null
    }

    setRoomActionBusy(action)
    setRoomActionTxHash('')
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (PRIVY_AUTH_ENABLED) {
        try {
          const accessToken = await getAccessToken()
          if (accessToken) headers.Authorization = `Bearer ${accessToken}`
        } catch {
          // best effort; backend falls back to hostToken
        }
      }
      const response = await fetch('/api/arena-room', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ roomId: savedRoomId, hostToken: hostControlToken || undefined, action, ...params }),
      })
      const data = await response.json() as {
        ok?: boolean
        room?: SavedArenaRoom
        txHash?: string
        chain?: { playerCount?: number; activeCount?: number; currentRound?: number }
        error?: string
      }
      if (!response.ok || !data.ok || !data.room) throw new Error(data.error ?? 'Arena room action failed.')
      setPaymentStatus(data.room.paymentStatus ?? paymentStatus)
      setRoomActionTxHash(data.txHash ?? '')
      if (typeof data.chain?.playerCount === 'number') setChainPlayerCount(data.chain.playerCount)
      if (typeof data.chain?.activeCount === 'number') setChainActiveCount(data.chain.activeCount)
      if (typeof data.chain?.currentRound === 'number' && data.chain.currentRound > 0) setRound(data.chain.currentRound)
      return data
    } catch (error) {
      const raw = error instanceof Error ? error.message : 'Arena room action failed.'
      // Surface a friendly message when the on-chain cancel is rejected
      // mid-game. The escrow contract only permits cancelRoom() from the
      // lobby state, so once any round has started the room cannot be
      // room-level cancelled. Each player still recovers their unstreamed
      // USDC individually via the existing Claim affordance.
      if (action === 'cancel' && /execution reverted|reverted|estimateGas/i.test(raw)) {
        setRoomLog('On-chain cancel is only allowed before the room starts. Each player can still Claim remaining USDC from escrow individually.')
      } else {
        setRoomLog(raw)
      }
      setCancelConfirm(false)
      return null
    } finally {
      setRoomActionBusy('')
    }
  }

  async function startRoom() {
    if (!canOpenDeposits || !canStartGame) {
      setRoomLog('Start requires room escrow and at least two funded players.')
      return
    }
    const data = await controlRoom('start')
    if (!data) {
      return
    }
    setStatus('playing')
    setRound(1)
    setSeconds(roomTimer)
    setSelected('')
    setRoomLog('Round 1 live. Room escrow started on Arc.')
  }

  async function cancelRoom() {
    const data = await controlRoom('cancel')
    if (!data) return
    setStatus('eliminated')
    setRoomLog('Room cancelled. Joined players can claim unstreamed USDC from escrow.')
  }

  function resetRoom() {
    setStatus('setup')
    setRound(1)
    setSeconds(roomTimer)
    setSelected('')
    setSavedRoomId('')
    setPaymentStatus('escrow_pending')
    setEscrowAddress(null)
    setPlatformFeeBps(PLATFORM_FEE_BPS)
    setChainPlayerCount(null)
    setChainActiveCount(null)
    setPlayerJoined(false)
    setPlayerActive(false)
    setPlayerRefunded(false)
    setPlayerStreamed(null)
    setPlayerRefundable(null)
    setJoinTxHash('')
    setJoinError('')
    setClaimTxHash('')
    setHostControlToken('')
    setRoomActionTxHash('')
    setRoomLog('Room preview ready')
  }

  async function submitAnswer(option: string) {
    if (status !== 'playing' || answerBusy || !savedRoomId) return
    if (!PRIVY_AUTH_ENABLED) {
      setRoomLog('Sign in with email to record your answer on-chain.')
      return
    }
    setSelected(option)
    setAnswerBusy(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setRoomLog('Sign in with email to record your answer on-chain.')
        return
      }
      const walletAddr = circleSession?.wallet.address || linkedCircleAddress
      if (walletAddr && /^0x[a-fA-F0-9]{40}$/.test(walletAddr)) {
        try {
          await fetch('/api/arena-room', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ roomId: savedRoomId, action: 'register-player', wallet: walletAddr }),
          })
        } catch {}
      }
      const response = await fetch('/api/arena-room', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ roomId: savedRoomId, action: 'submit-answer', roundNumber: round, choice: option }),
      })
      const data = await response.json() as {
        ok?: boolean
        correct?: boolean
        eliminated?: boolean
        won?: boolean
        finished?: boolean
        winner?: string | null
        nextRound?: number
        txHash?: string
        chain?: { playerCount?: number; activeCount?: number; currentRound?: number }
        error?: string
      }
      if (!response.ok || !data.ok) {
        const message = data.error ?? 'Could not submit answer.'
        // Backend rejects when escrow.players(addr).active is false. The user
        // was already eliminated by an earlier round timer or eliminate call.
        // Surface the right end-state so they see Claim instead of a dead
        // question card.
        if (/already inactive/i.test(message) || /has not joined/i.test(message)) {
          setStatus('eliminated')
          setRoomLog('You were eliminated in an earlier round. Claim any remaining USDC.')
          if (circleSession?.wallet.address) void refreshRoomChainState(circleSession.wallet.address)
        } else {
          setRoomLog(message)
        }
        return
      }
      if (data.txHash) setRoomActionTxHash(data.txHash)
      if (typeof data.chain?.playerCount === 'number') setChainPlayerCount(data.chain.playerCount)
      if (typeof data.chain?.activeCount === 'number') setChainActiveCount(data.chain.activeCount)

      if (data.eliminated) {
        setStatus('eliminated')
        setRoomLog('Stopped. Your remaining USDC is still claimable.')
      } else if (data.won) {
        setStatus('won')
        setRoomLog('Winner. Prize pool is ready to claim.')
      } else if (data.finished) {
        setStatus('eliminated')
        setRoomLog('Room finished — another player claimed the prize first.')
      } else if (data.correct && typeof data.nextRound === 'number') {
        setRound(data.nextRound)
        setSelected('')
        setRoomLog(`Correct. Round ${data.nextRound} unlocks a higher risk stream.`)
      }

      if (circleSession?.wallet.address) void refreshRoomChainState(circleSession.wallet.address)
    } catch (error) {
      setRoomLog(error instanceof Error ? error.message : 'Could not submit answer.')
    } finally {
      setAnswerBusy(false)
    }
  }

  async function joinRoomWithCircle() {
    setJoinError('')
    setJoinTxHash('')

    if (!canOpenDeposits || !escrowAddress) {
      setJoinError('Room escrow is not open yet.')
      return
    }
    if (!canUseCircleEvmEmailWallet('arc')) {
      setJoinError('Arc wallet access is not configured.')
      return
    }
    if (!privyReady) {
      loginPrivy({ loginMethods: ['email'] })
      setJoinError('Sign in with email to unlock your wallet.')
      return
    }

    const email = walletEmail
    if (!circleSession && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setJoinError('Enter the email for your wallet.')
      return
    }

    setJoinBusy(true)
    try {
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      setCircleEmail(email || session.wallet.address)
      void rememberPrivyCircleSession(session, email)

      const entryUnits = parseUnits(String(entry), ARC_USDC_DECIMALS)
      const balance = await ARC_PUBLIC_CLIENT.readContract({
        address: ARC_USDC_ADDRESS,
        abi: USDC_BALANCE_ABI,
        functionName: 'balanceOf',
        args: [session.wallet.address],
      })
      setCircleBalance(balance)
      if (balance < entryUnits) {
        throw new Error(`Add ${entry} USDC on Arc to this wallet before joining.`)
      }

      setRoomLog('Your wallet is funding your room seat.')
      const txHash = await sendCircleArcArenaJoin({
        session,
        escrowAddress: escrowAddress as Address,
        entryUnits: entryUnits.toString(),
      })
      if (txHash) setJoinTxHash(txHash)
      setPlayerJoined(true)
      setCircleBalance(prev => (prev !== null && prev >= entryUnits ? prev - entryUnits : prev))
      setRoomLog('Seat funded. Waiting for the room to fill.')
      void registerArenaPlayer(session.wallet.address)
      if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        try {
          await ARC_PUBLIC_CLIENT.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 30_000 })
        } catch {}
      }
      await refreshRoomChainState(session.wallet.address)
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Arena deposit failed.')
    } finally {
      setJoinBusy(false)
    }
  }

  async function claimRefundWithCircle() {
    setJoinError('')
    setClaimTxHash('')

    if (!canClaimRefund || !escrowAddress) {
      setJoinError('No claimable Arena balance for this wallet.')
      return
    }
    if (!circleAvailable) {
      setJoinError('Arc wallet access is not configured.')
      return
    }
    if (!privyReady) {
      loginPrivy({ loginMethods: ['email'] })
      setJoinError('Sign in with email to claim from your wallet.')
      return
    }

    const email = walletEmail
    if (!circleSession && !isEmail(email)) {
      setJoinError('Enter the email for your wallet.')
      return
    }

    setClaimBusy(true)
    try {
      const session = circleSession ?? await connectCircleEvmEmailWallet(email, 'arc')
      setCircleSession(session)
      setCircleEmail(email || session.wallet.address)
      void rememberPrivyCircleSession(session, email)

      setRoomLog('Your wallet is claiming your remaining USDC.')
      const txHash = await sendCircleArcArenaRefund({
        session,
        escrowAddress: escrowAddress as Address,
      })
      if (txHash) setClaimTxHash(txHash)
      setPlayerRefunded(true)
      setRoomLog('Remaining USDC claimed from the room escrow.')
      if (txHash && /^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        try {
          await ARC_PUBLIC_CLIENT.waitForTransactionReceipt({ hash: txHash as `0x${string}`, timeout: 30_000 })
        } catch {}
      }
      await refreshRoomChainState(session.wallet.address)
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Arena refund failed.')
    } finally {
      setClaimBusy(false)
    }
  }

  async function shareRoomLink() {
    try {
      if (navigator.share) {
        const label = savedRoomName ? `${savedRoomName} (${roomCode})` : roomCode
        await navigator.share({
          title: 'StreamPay Arena private room',
          text: `Join my Stream Trivia room ${label}`,
          url: privateUrl,
        })
        return
      }
      await navigator.clipboard.writeText(privateUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      setCopied(false)
    }
  }

  function openTrivia() {
    setView('list')
    setActiveTab('room')
    resetRoom()
  }

  function openPrivateRoom() {
    setView('private')
    setActiveTab('room')
    resetRoom()
  }

  function backToList() {
    setView('list')
    setActiveTab('room')
    resetRoom()
    // Strip the room id from the URL so a refresh lands on the list, not the
    // room they just left.
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href)
        url.searchParams.delete('room')
        url.searchParams.delete('entry')
        url.searchParams.delete('players')
        url.searchParams.delete('rounds')
        url.searchParams.delete('risk')
        window.history.replaceState(null, '', url.toString())
      } catch {
        // non-fatal
      }
    }
  }

  return (
    <div className="mx-auto mt-4 w-full max-w-[940px] px-0 pb-6 sm:mt-5">
      <div className="mb-3 rounded-[20px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">StreamPay Arena</p>
            <h1 className="mt-1.5 text-[23px] font-bold tracking-tight text-gray-950 dark:text-white sm:text-[26px]">
              USDC games with recoverable risk.
            </h1>
            <p className="mt-1.5 max-w-[520px] text-[12px] leading-relaxed text-gray-500 dark:text-gray-400">
              Create private USDC rooms with protected risk. Deposits open only through per-room Arena escrow.
            </p>
          </div>
          <div className="hidden rounded-2xl bg-gray-950 px-2.5 py-1.5 text-right text-white dark:bg-white dark:text-gray-950 sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-60">Asset</p>
            <p className="text-[13px] font-bold">USDC</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            ['Wallet', 'Embedded'],
            ['Network', 'Arc'],
            ['Mode', view === 'games' ? 'Lobby' : view === 'list' ? 'My rooms' : 'Private'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-2xl bg-gray-50 p-2.5 dark:bg-white/[0.04]">
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{title}</p>
              <p className="mt-0.5 text-[12px] font-bold text-gray-950 dark:text-white">{body}</p>
            </div>
          ))}
        </div>
      </div>

      {view === 'games' && (
        <div className="space-y-3">
          <GameCard
            variant="trivia"
            title="Stream Trivia"
            status="Private rooms"
            body="Create a saved room, invite players, then open USDC deposits when the room escrow is live."
            action="Play Trivia"
            onClick={openTrivia}
          />
          <GameCard
            variant="prediction"
            title="Prediction Rooms"
            status="Coming soon"
            body="Group prediction games with streamed entry risk and room leaderboards."
            action="Coming soon"
            disabled
          />
          <GameCard
            variant="creator"
            title="Creator Rooms"
            status="Coming soon"
            body="Creator-hosted USDC rooms for private communities and paid events."
            action="Coming soon"
            disabled
          />
        </div>
      )}

      {view === 'list' && (
        <div className="space-y-3">
          <BackButton onClick={() => setView('games')}>Games</BackButton>
          <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold text-gray-950 dark:text-white">My trivia rooms</p>
                <p className="mt-0.5 text-[11px] text-gray-400">Hosted or joined, still in lobby or live.</p>
              </div>
              <button
                type="button"
                onClick={openPrivateRoom}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-950 px-3 py-1.5 text-[11px] font-black text-white transition-transform active:scale-[0.98] dark:bg-white dark:text-gray-950"
              >
                + New room
              </button>
            </div>

            {!privyAuthenticated && PRIVY_AUTH_ENABLED ? (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[12px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                Sign in with email to see your saved rooms.
              </div>
            ) : myRoomsLoading && myRooms.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-4 text-center text-[12px] font-semibold text-gray-400 dark:border-white/10 dark:bg-white/[0.04]">
                Loading your rooms...
              </div>
            ) : myRoomsError ? (
              <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 px-3 py-3 text-[11px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04]">
                {myRoomsError}
              </div>
            ) : myRooms.length === 0 ? (
              <div className="mt-3 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[12px] font-semibold text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">
                No active rooms yet. Tap + New room to create one.
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                {myRooms.map(room => (
                  <button
                    key={room.roomId}
                    type="button"
                    onClick={() => { void loadSavedRoom(room.roomId) }}
                    className="block w-full rounded-2xl border border-gray-100 bg-gray-50 p-3 text-left transition-all hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-white/20"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-black text-gray-950 dark:text-white">{room.name || room.roomId}</p>
                        <p className="mt-0.5 truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                          {room.name ? `${room.roomId} · ` : ''}{room.entry} USDC · {room.players} seats
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className={[
                          'rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em]',
                          room.status === 'playing'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200'
                            : 'bg-gray-200 text-gray-700 dark:bg-white/10 dark:text-gray-200',
                        ].join(' ')}>
                          {room.status === 'playing' ? 'Live' : 'Lobby'}
                        </span>
                        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">
                          {room.role === 'host' ? 'Host' : 'Player'}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === 'private' && (
        <div className="grid gap-3 lg:grid-cols-[minmax(250px,0.68fr)_minmax(460px,1.32fr)]">
          <section className="space-y-3">
            <BackButton onClick={backToList}>My trivia rooms</BackButton>
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
              <TabButton active={activeTab === 'room'} onClick={() => setActiveTab('room')}>Room</TabButton>
              <TabButton active={activeTab === 'how'} onClick={() => setActiveTab('how')}>How to play</TabButton>
              <TabButton active={activeTab === 'settings'} onClick={() => setActiveTab('settings')}>Settings</TabButton>
            </div>

            {activeTab === 'room' && status === 'setup' && (
              <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-gray-950 dark:text-white">Create room</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">Choose who can join before deposits open.</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500 dark:bg-white/10 dark:text-gray-300">
                    Private
                  </span>
                </div>

                <div className="mt-3 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Private invite</p>
                    <p className="text-[10px] font-bold text-gray-400">Only link holders join</p>
                  </div>
                  <div className="mt-2 rounded-xl bg-white px-3 py-2 dark:bg-white/5">
                    <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">
                      Create the lobby to generate a saved invite link.
                    </p>
                  </div>
                </div>

                <div className="mt-3 rounded-2xl bg-gray-50 p-2.5 dark:bg-white/[0.04]">
                  <div className="grid grid-cols-3 gap-2">
                    <Metric label="Prize" value={`$${money(netPrize)}`} compact />
                    <Metric label="Start risk" value={`$${money(entry * roundWeight(1, rounds, riskMode))}`} compact />
                    <Metric label="Fee" value={`${(platformFeeBps / 100).toFixed(1)}%`} compact />
                  </div>
                </div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">Name (optional)</p>
                      <p className="text-[10px] font-bold text-gray-400">{Math.max(0, 60 - roomName.length)} left</p>
                    </div>
                    <input
                      type="text"
                      value={roomName}
                      onChange={(event) => setRoomName(event.target.value.slice(0, 60))}
                      placeholder="Friday Night Trivia"
                      className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13px] font-semibold text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-400 dark:border-white/10 dark:bg-white/[0.06] dark:text-white dark:placeholder:text-gray-500 dark:focus:border-white/30"
                    />
                  </div>
                  <RangedNumberSegment
                    label="Entry"
                    unit="USDC"
                    value={entry}
                    presets={ENTRY_OPTIONS}
                    bounds={ENTRY_BOUNDS}
                    onChange={setEntry}
                  />

                  <RangedNumberSegment
                    label="Players"
                    value={players}
                    presets={PLAYER_OPTIONS}
                    bounds={PLAYERS_BOUNDS}
                    onChange={setPlayers}
                  />

                  <RangedNumberSegment
                    label="Rounds"
                    value={rounds}
                    presets={ROUND_OPTIONS}
                    bounds={ROUNDS_BOUNDS}
                    onChange={setRounds}
                  />

                  <Segment label="Risk curve" value={riskLabel(riskMode)}>
                    {(['linear', 'climb', 'finale'] as RiskMode[]).map(value => (
                      <button key={value} type="button" onClick={() => setRiskMode(value)} className={segmentButton(riskMode === value)}>
                        {riskLabel(value)}
                      </button>
                    ))}
                  </Segment>
                </div>

                <button
                  type="button"
                  onClick={createLobby}
                  disabled={roomSaving || !lobbySettingsValid}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 py-2.5 text-[12px] font-bold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950"
                >
                  <Play className="h-4 w-4" />
                  {roomSaving ? 'Saving lobby...' : !lobbySettingsValid ? 'Adjust settings to continue' : 'Create private lobby'}
                </button>
              </div>
            )}

            {activeTab === 'room' && status !== 'setup' && (
              <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-bold text-gray-950 dark:text-white">{savedRoomName || 'Room'}</p>
                    <p className="mt-0.5 truncate text-[11px] text-gray-400">{roomCode} · 0.5% fee on completed room</p>
                  </div>
                  <StatusPill status={status} />
                </div>

                {chainActiveCount === 0 && status !== 'lobby' && (
                  <div className="mt-3 rounded-2xl border border-gray-200 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Room stalled</p>
                    <p className="mt-1 text-[11px] leading-snug text-gray-500 dark:text-gray-400">
                      {canHostControl
                        ? 'No players are still streaming. Refund everyone with Cancel stuck room below.'
                        : 'No players are still streaming. Your remaining USDC is claimable from escrow.'}
                    </p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Entry" value={`${entry} USDC`} compact />
                  <Metric label="Players" value={`${joinedPlayers}/${players}`} compact />
                  <Metric label="Active" value={`${chainActiveCount ?? joinedPlayers}`} compact />
                  <Metric label="Prize" value={`$${money(netPrize)}`} compact />
                </div>

                <div className="mt-4 rounded-2xl border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">Invite</p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-gray-700 dark:text-gray-200">{privateUrl}</p>
                    <button
                      type="button"
                      onClick={shareRoomLink}
                      className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-gray-950 px-2.5 text-[11px] font-bold text-white dark:bg-white dark:text-gray-950"
                    >
                      <Share2 className="h-3.5 w-3.5" />
                      {copied ? 'Copied' : 'Share'}
                    </button>
                  </div>
                </div>

                {(status === 'eliminated' || status === 'won') && (
                  <button
                    type="button"
                    onClick={resetRoom}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 py-3 text-[12px] font-bold text-white transition-transform active:scale-[0.98] dark:bg-white dark:text-gray-950"
                  >
                    <RotateCcw className="h-4 w-4" />
                    New room
                  </button>
                )}
              </div>
            )}

            {activeTab === 'how' && <HowToPlay />}
            {activeTab === 'settings' && (
              <ArenaSettings
                timer={roomTimer}
                setTimer={setRoomTimer}
                startRule={startRule}
                setStartRule={setStartRule}
              />
            )}
          </section>

          <section className="space-y-3">
            <div className="rounded-[24px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216] sm:p-4">
              <div className="overflow-hidden rounded-[22px] bg-gray-950 p-4 text-white dark:bg-white dark:text-gray-950 sm:p-4">
                {status === 'setup' && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 dark:text-gray-500">Room setup</p>
                    <h2 className="mt-1.5 text-[19px] font-black leading-tight">Create a private Trivia lobby.</h2>
                    <p className="mt-1.5 max-w-[390px] text-[11px] leading-relaxed text-white/58 dark:text-gray-500">
                      Lock the entry and share the invite. USDC deposits stay disabled until room escrow is created.
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <DarkMetric label="Code" value={roomCode} />
                      <DarkMetric label="Entry" value={`${entry} USDC`} />
                      <DarkMetric label="Fee" value={`${(platformFeeBps / 100).toFixed(1)}%`} />
                    </div>
                  </div>
                )}

                {status === 'lobby' && (() => {
                  const walletAddress = circleSession?.wallet.address || linkedCircleAddress || ''
                  return (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 dark:text-gray-500">Private lobby</p>
                        <h2 className="mt-1 text-[18px] font-black leading-tight">{canHostControl ? 'Lobby saved' : 'Lobby live'}</h2>
                      </div>
                      <p className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black dark:bg-gray-100">
                        {joinedPlayers}/{players}
                      </p>
                    </div>
                    <div className="mt-3 rounded-[18px] border border-white/10 bg-white/[0.07] p-2.5 dark:border-gray-200 dark:bg-gray-100">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-black">{playerJoined ? 'Seat funded' : 'Deposit seat'}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-white/50 dark:text-gray-500">
                            {playerJoined ? 'You are in this room. Unused USDC stays claimable.' : `${entry} USDC funds your protected Arena seat.`}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-1 text-[10px] font-black text-white/65 dark:bg-white dark:text-gray-500">
                          Email + wallet
                        </span>
                      </div>

                      <div className="mt-2.5 grid grid-cols-2 gap-2">
                        <DarkMetric label="Access" value={privyReady ? (walletEmail || 'Signed in') : 'Email sign-in'} />
                        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2 dark:border-gray-200 dark:bg-white">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 dark:text-gray-500">Wallet</p>
                          <div className="mt-0.5 flex items-center justify-between gap-1.5">
                            <p className="truncate text-[12px] font-black text-white dark:text-gray-950">
                              {walletAddress ? shortAddress(walletAddress) : 'On action'}
                            </p>
                            {walletAddress && (
                              <button
                                type="button"
                                onClick={copyArenaWalletAddress}
                                aria-label="Copy wallet address"
                                className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[9px] font-black text-white/70 transition-colors hover:bg-white/20 hover:text-white dark:bg-gray-100 dark:text-gray-600 dark:hover:bg-gray-200 dark:hover:text-gray-950"
                              >
                                {walletCopied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
                                {walletCopied ? 'Copied' : 'Copy'}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {!PRIVY_AUTH_ENABLED && !circleSession && (
                        <input
                          value={circleEmail}
                          onChange={(event) => setCircleEmail(event.target.value)}
                          type="email"
                          placeholder="you@example.com"
                          className="mt-2 h-9 w-full rounded-xl border border-white/10 bg-white/10 px-3 text-[12px] font-semibold text-white outline-none placeholder:text-white/30 focus:border-white/30 dark:border-gray-200 dark:bg-white dark:text-gray-950 dark:placeholder:text-gray-400"
                        />
                      )}

                      {circleSession && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <DarkMetric label="Balance" value={circleBalance === null ? 'Checking' : `${formatCompactUsdc(circleBalance)} USDC`} />
                          <DarkMetric label="Escrow" value={playerJoined ? 'Funded' : 'Ready'} />
                        </div>
                      )}

                      {playerJoined && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <DarkMetric label="Streamed" value={playerStreamed === null ? '-' : `${formatCompactUsdc(playerStreamed)} USDC`} />
                          <DarkMetric label="Claimable" value={playerRefundable === null ? '-' : `${formatCompactUsdc(playerRefundable)} USDC`} />
                        </div>
                      )}

                      {joinError && (
                        <p className="mt-2 rounded-xl bg-white/[0.06] px-3 py-2 text-[10px] font-semibold text-white/65 dark:bg-gray-100 dark:text-gray-600">
                          {joinError}
                        </p>
                      )}
                      {privyCircleLinkError && (
                        <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold text-white/55 dark:bg-white dark:text-gray-500">
                          {privyCircleLinkError}
                        </p>
                      )}
                      {joinTxHash && (
                        <a
                          href={`${CHAIN_META.arc.explorerUrl}/tx/${joinTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block truncate rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold text-white/70 underline decoration-white/20 underline-offset-4 dark:bg-white dark:text-gray-600"
                        >
                          View deposit transaction
                        </a>
                      )}

                      <div className="mt-2.5 grid gap-2">
                        <button
                          type="button"
                          onClick={joinRoomWithCircle}
                          disabled={!canOpenDeposits || joinBusy || playerJoined}
                          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-[12px] font-black text-gray-950 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-gray-950 dark:text-white"
                        >
                          <WalletCards className="h-4 w-4" />
                          {playerJoined
                            ? 'Seat funded'
                            : joinBusy
                              ? 'Confirming...'
                              : !privyReady
                                ? 'Sign in to play'
                                : canOpenDeposits
                                  ? 'Deposit & join'
                                  : 'Preparing escrow'}
                        </button>
                        {!canOpenDeposits && !playerJoined && (
                          <button
                            type="button"
                            onClick={refreshSavedRoom}
                            disabled={!savedRoomId || refreshBusy}
                            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 py-2 text-[12px] font-black text-white/70 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-gray-200 dark:text-gray-600 dark:hover:bg-white"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${refreshBusy ? 'animate-spin' : ''}`} />
                            {refreshBusy ? 'Refreshing...' : 'Refresh room'}
                          </button>
                        )}
                      </div>
                      {(Boolean(walletEmail) || circleSession || linkedCircleAddress) && (
                        <button
                          type="button"
                          onClick={disconnectArenaWallet}
                          className="mt-2 inline-flex w-full items-center justify-center rounded-xl border border-white/10 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-white/55 transition-colors hover:bg-white/10 hover:text-white dark:border-gray-200 dark:text-gray-500 dark:hover:bg-white dark:hover:text-gray-950"
                        >
                          Sign out
                        </button>
                      )}
                      {canClaimRefund && (
                        <button
                          type="button"
                          onClick={claimRefundWithCircle}
                          disabled={claimBusy}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 py-2 text-[12px] font-black text-white/80 transition-transform hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:border-gray-200 dark:text-gray-700 dark:hover:bg-white"
                        >
                          <WalletCards className="h-4 w-4" />
                          {claimBusy ? 'Claiming...' : 'Claim remaining USDC'}
                        </button>
                      )}
                      {playerRefunded && (
                        <p className="mt-2 rounded-xl bg-emerald-400/10 px-3 py-2 text-center text-[10px] font-bold text-emerald-100 dark:bg-emerald-100 dark:text-emerald-700">
                          Remaining USDC claimed.
                        </p>
                      )}
                      {claimTxHash && (
                        <a
                          href={`${CHAIN_META.arc.explorerUrl}/tx/${claimTxHash}`}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 block truncate rounded-xl bg-white/10 px-3 py-2 text-[10px] font-bold text-white/70 underline decoration-white/20 underline-offset-4 dark:bg-white dark:text-gray-600"
                        >
                          View claim transaction
                        </a>
                      )}
                    </div>
                    <PlayerSlots total={players} joined={joinedPlayers} />
                    {canHostControl ? (
                      <>
                        <button
                          type="button"
                          onClick={startRoom}
                          disabled={!canOpenDeposits || !canStartGame || Boolean(roomActionBusy)}
                          className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-[12px] font-black text-gray-950 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-gray-950 dark:text-white"
                        >
                          <Play className="h-4 w-4" />
                          {roomActionBusy === 'start'
                            ? 'Starting...'
                            : canStartGame
                              ? 'Start paid room'
                              : 'Waiting for players'}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (roomActionBusy) return
                            if (cancelConfirm) {
                              setCancelConfirm(false)
                              void cancelRoom()
                            } else {
                              setCancelConfirm(true)
                            }
                          }}
                          disabled={Boolean(roomActionBusy)}
                          className={[
                            'mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border py-2 text-[12px] font-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
                            cancelConfirm
                              ? 'border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15 dark:border-rose-300/40 dark:bg-rose-100 dark:text-rose-700 dark:hover:bg-rose-50'
                              : 'border-white/10 text-white/70 hover:bg-white/10 dark:border-gray-200 dark:text-gray-500 dark:hover:bg-gray-100',
                          ].join(' ')}
                        >
                          {roomActionBusy === 'cancel'
                            ? 'Cancelling...'
                            : cancelConfirm
                              ? 'Tap again to refund everyone'
                              : 'Cancel room'}
                        </button>
                      </>
                    ) : (
                      <div className="mt-3 flex w-full items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] py-2 text-[10px] font-black uppercase tracking-[0.14em] text-white/65 dark:border-gray-200 dark:bg-gray-100 dark:text-gray-500">
                        Waiting for host
                      </div>
                    )}
                    {roomActionTxHash && (
                      <a
                        href={`${CHAIN_META.arc.explorerUrl}/tx/${roomActionTxHash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 block truncate text-center text-[10px] font-bold text-white/50 underline decoration-white/20 underline-offset-4 dark:text-gray-500"
                      >
                        View room action
                      </a>
                    )}
                    <p className="mt-2 text-center text-[10px] font-semibold text-white/45 dark:text-gray-500">
                      Email signs you in. Your wallet signs the Arc deposit.
                    </p>
                  </div>
                  )
                })()}

                {status === 'playing' && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                      <span className="text-white/60 dark:text-gray-500">Round {round}/{rounds}</span>
                      <span className="inline-flex items-center gap-1 text-white dark:text-gray-950">
                        <Clock3 className="h-3.5 w-3.5" />
                        {seconds}s
                      </span>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15 dark:bg-gray-200">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-500 dark:bg-gray-950"
                        style={{ width: `${percent(round / rounds)}` }}
                      />
                    </div>

                    <div className="mt-3 rounded-[20px] bg-white/10 p-3 dark:bg-gray-100 sm:p-3.5">
                      {activeQuestion ? (
                        <>
                          <p className="text-[15px] font-bold leading-snug text-white dark:text-gray-950">{activeQuestion.prompt}</p>
                          <div className="mt-3 grid gap-2 sm:grid-cols-2">
                            {activeQuestion.options.map(option => (
                              <button
                                key={option}
                                type="button"
                                disabled={status !== 'playing' || answerBusy}
                                onClick={() => submitAnswer(option)}
                                className={[
                                  'min-h-10 rounded-xl border px-3 text-left text-[12px] font-semibold transition-all',
                                  selected === option
                                    ? 'border-white bg-white text-gray-950 dark:border-gray-950 dark:bg-gray-950 dark:text-white'
                                    : 'border-white/10 bg-white/10 text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-200 dark:bg-white dark:text-gray-700 dark:hover:bg-gray-50',
                                ].join(' ')}
                              >
                                {option}
                              </button>
                            ))}
                          </div>
                          {answerBusy && (
                            <p className="mt-2 text-center text-[10px] font-semibold text-white/55 dark:text-gray-500">Submitting answer...</p>
                          )}
                        </>
                      ) : (
                        <p className="py-4 text-center text-[12px] font-semibold text-white/55 dark:text-gray-500">
                          {questionLoading ? 'Loading round question...' : 'Waiting for round to start.'}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {(status === 'eliminated' || status === 'won') && (
                  <div>
                    <div className="flex items-center justify-between text-[11px] font-bold text-gray-400">
                      <span className="text-white/60 dark:text-gray-500">
                        {status === 'won' ? `Finished ${rounds}/${rounds}` : `Stopped at round ${round}/${rounds}`}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] text-white dark:bg-gray-100 dark:text-gray-700">
                        {status === 'won' ? 'Winner' : 'Game over'}
                      </span>
                    </div>
                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/15 dark:bg-gray-200">
                      <div
                        className="h-full rounded-full bg-white transition-all duration-500 dark:bg-gray-950"
                        style={{ width: `${percent(round / rounds)}` }}
                      />
                    </div>
                    {canHostControl && status === 'eliminated' && chainActiveCount === 0 && (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 dark:border-gray-200 dark:bg-gray-100">
                        <p className="text-[11px] font-black uppercase tracking-[0.14em] text-white/65 dark:text-gray-700">Stuck room</p>
                        <p className="mt-1 text-[11px] leading-snug text-white/55 dark:text-gray-500">
                          All players have stopped streaming. Cancel to refund every player's remaining USDC from escrow.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            if (roomActionBusy) return
                            if (cancelConfirm) {
                              setCancelConfirm(false)
                              void cancelRoom()
                            } else {
                              setCancelConfirm(true)
                            }
                          }}
                          disabled={Boolean(roomActionBusy)}
                          className={[
                            'mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border py-2 text-[12px] font-black transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
                            cancelConfirm
                              ? 'border-rose-400/40 bg-rose-500/10 text-rose-100 hover:bg-rose-500/15 dark:border-rose-300/40 dark:bg-rose-100 dark:text-rose-700 dark:hover:bg-rose-50'
                              : 'border-white/10 text-white/70 hover:bg-white/10 dark:border-gray-200 dark:text-gray-500 dark:hover:bg-gray-100',
                          ].join(' ')}
                        >
                          {roomActionBusy === 'cancel'
                            ? 'Cancelling...'
                            : cancelConfirm
                              ? 'Tap again to refund everyone'
                              : 'Cancel stuck room'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>

            {(status === 'playing' || status === 'eliminated' || status === 'won') && (
              <div className="mt-3 rounded-[20px] border border-gray-100 bg-gray-50 p-3 dark:border-white/10 dark:bg-white/[0.04]">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Risk meter</p>
                  <p className="text-[11px] font-bold text-gray-400">{riskProgress}% streamed</p>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-white/10">
                  <div className="h-full rounded-full bg-gray-950 transition-all dark:bg-white" style={{ width: `${riskProgress}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Metric icon={<LockKeyhole className="h-3.5 w-3.5" />} label="Still yours" value={`$${money(remaining)}`} />
                  <Metric icon={<WalletCards className="h-3.5 w-3.5" />} label="Pot preview" value={`$${money(prizePool)}`} />
                  <Metric icon={<Trophy className="h-3.5 w-3.5" />} label="Next risk" value={`$${money(nextRoundCost)}`} />
                </div>
              </div>
            )}

            <div className="mt-3 rounded-[20px] border border-gray-100 bg-gray-50 p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold text-gray-950 dark:text-white">{roomLog}</p>
                  {(status === 'won' || status === 'eliminated' || status === 'playing') && (
                    <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                      {status === 'won'
                        ? 'Prize claim will be wired to the Arc room vault.'
                        : status === 'eliminated'
                          ? 'Your stream stopped. Only streamed risk stays in the pot.'
                          : `${alivePlayers} players active. Unstreamed USDC stays claimable from escrow.`}
                    </p>
                  )}
                </div>
                {(status === 'eliminated' || status === 'won') && (
                  <button
                    type="button"
                    onClick={resetRoom}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-600 transition-colors hover:bg-white dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Again
                  </button>
                )}
              </div>
              {playerJoined && (status === 'playing' || status === 'eliminated' || status === 'won') && (
                <div className="mt-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-white/10 dark:bg-white/[0.04]">
                  <div className="grid grid-cols-2 gap-2">
                    <Metric icon={<WalletCards className="h-3.5 w-3.5" />} label="Streamed" value={playerStreamed === null ? '-' : `${formatCompactUsdc(playerStreamed)} USDC`} />
                    <Metric icon={<LockKeyhole className="h-3.5 w-3.5" />} label="Claimable" value={playerRefundable === null ? '-' : `${formatCompactUsdc(playerRefundable)} USDC`} />
                  </div>
                  {canClaimRefund && (
                    <button
                      type="button"
                      onClick={claimRefundWithCircle}
                      disabled={claimBusy}
                      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 py-2.5 text-[12px] font-black text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-gray-950"
                    >
                      <WalletCards className="h-4 w-4" />
                      {claimBusy ? 'Claiming...' : 'Claim remaining USDC'}
                    </button>
                  )}
                  {playerRefunded && (
                    <p className="mt-2 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[10px] font-bold text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-100">
                      Remaining USDC claimed.
                    </p>
                  )}
                  {claimTxHash && (
                    <a
                      href={`${CHAIN_META.arc.explorerUrl}/tx/${claimTxHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block truncate text-center text-[10px] font-bold text-gray-500 underline decoration-gray-300 underline-offset-4 dark:text-gray-400 dark:decoration-white/20"
                    >
                      View claim transaction
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {(status === 'playing' || status === 'eliminated' || status === 'won') && (
            <LeaderboardCard
              total={players}
              joined={joinedPlayers}
              active={chainActiveCount ?? joinedPlayers}
              status={status}
              round={round}
              currentPlayerJoined={playerJoined}
            />
          )}
        </section>
      </div>
      )}
    </div>
  )
}

type GameCardVariant = 'trivia' | 'prediction' | 'creator'

function GameCard({ variant, title, status, body, action, onClick, disabled = false }: { variant: GameCardVariant; title: string; status: string; body: string; action: string; onClick?: () => void; disabled?: boolean }) {
  const art = gameCardArt(variant)
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={[
        'group relative min-h-[126px] w-full overflow-hidden rounded-[22px] border p-3.5 text-left shadow-sm transition-all sm:min-h-[136px]',
        disabled
          ? 'border-gray-100 bg-gray-950 text-white opacity-75 dark:border-white/10'
          : 'border-gray-100 bg-gray-950 text-white hover:-translate-y-0.5 hover:border-gray-200 hover:shadow-md dark:border-white/10',
      ].join(' ')}
      style={{ background: art.background }}
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,5,10,0.92),rgba(4,5,10,0.74)_48%,rgba(4,5,10,0.35))]" />
      <div className="absolute inset-y-0 right-0 w-[48%] opacity-90 transition-transform duration-500 group-hover:scale-[1.03]">
        <div className={['absolute right-4 top-4 flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/15 shadow-2xl', art.iconShell].join(' ')}>
          {art.icon}
        </div>
        <div className="absolute bottom-4 right-4 grid grid-cols-3 gap-1.5 opacity-80">
          {art.tiles.map(tile => (
            <span key={tile} className="h-7 w-7 rounded-xl border border-white/10 bg-white/10 text-center text-[9px] font-black leading-7 text-white/80 shadow-lg backdrop-blur">
              {tile}
            </span>
          ))}
        </div>
        <div className="absolute right-14 top-20 h-20 w-20 rotate-12 rounded-[24px] border border-white/10 bg-white/[0.06]" />
        <div className="absolute bottom-14 right-24 h-14 w-14 -rotate-12 rounded-[18px] border border-white/10 bg-white/[0.04]" />
      </div>

      <div className="relative z-10 flex min-h-[100px] flex-col justify-between sm:min-h-[108px]">
        <div className="max-w-[68%]">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{status}</p>
          <p className="mt-1.5 text-[16px] font-black text-white">{title}</p>
          <p className="mt-0.5 max-w-[420px] text-[11px] leading-snug text-white/62">{body}</p>
        </div>
        <span className={[
          'inline-flex w-fit shrink-0 items-center rounded-full px-2.5 py-1 text-[10px] font-bold',
          disabled ? 'bg-white/10 text-white/45' : 'bg-white text-gray-950',
        ].join(' ')}>
          {action}
        </span>
      </div>
    </button>
  )
}

function gameCardArt(variant: GameCardVariant) {
  if (variant === 'trivia') {
    return {
      background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 18px), linear-gradient(135deg, #07080f 0%, #142016 48%, #0b0c10 100%)',
      iconShell: 'bg-emerald-400/18',
      icon: <Crown className="h-6 w-6 text-emerald-200" />,
      tiles: ['Q', '$', '15'],
    }
  }
  if (variant === 'prediction') {
    return {
      background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 22px), linear-gradient(135deg, #07080f 0%, #0c1730 52%, #0b0c10 100%)',
      iconShell: 'bg-blue-400/18',
      icon: <Sparkles className="h-6 w-6 text-blue-200" />,
      tiles: ['1', 'X', '2'],
    }
  }
  return {
    background: 'repeating-linear-gradient(45deg, rgba(255,255,255,0.08) 0 1px, transparent 1px 20px), linear-gradient(135deg, #07080f 0%, #281327 52%, #0b0c10 100%)',
    iconShell: 'bg-pink-400/18',
    icon: <Users className="h-6 w-6 text-pink-200" />,
    tiles: ['VIP', 'LIVE', '$'],
  }
}

function BackButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border border-gray-100 bg-white px-2.5 py-1.5 text-[11px] font-bold text-gray-500 shadow-sm hover:text-gray-950 dark:border-white/10 dark:bg-[#111216] dark:text-gray-300 dark:hover:text-white"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {children}
    </button>
  )
}

function DarkMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2 dark:border-gray-200 dark:bg-white">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 dark:text-gray-500">{label}</p>
      <p className="mt-0.5 truncate text-[12px] font-black text-white dark:text-gray-950">{value}</p>
    </div>
  )
}

function PlayerSlots({ total, joined }: { total: number; joined: number }) {
  return (
    <div className="mt-3">
      <div className="grid grid-cols-5 gap-1.5">
        {Array.from({ length: total }, (_, index) => {
          const active = index < joined
          return (
            <div
              key={index}
              className={[
                'flex min-h-10 flex-col items-center justify-center rounded-xl border text-center',
                active
                  ? 'border-white/15 bg-white text-gray-950 dark:border-gray-200 dark:bg-gray-950 dark:text-white'
                  : 'border-white/10 bg-white/[0.06] text-white/35 dark:border-gray-200 dark:bg-gray-100 dark:text-gray-400',
              ].join(' ')}
            >
              <span className="text-[11px] font-black">{active ? `P${index + 1}` : '-'}</span>
              <span className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.08em] opacity-55">{active ? 'Ready' : 'Open'}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HowToPlay() {
  return (
    <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
      <p className="text-[13px] font-bold text-gray-950 dark:text-white">How to play</p>
      <div className="mt-3 space-y-2.5">
        <Step index="1" title="Create a room" body="Pick entry, player count, rounds, timer, and risk curve." />
        <Step index="2" title="Invite players" body="Share the private link. Players sign in with email." />
        <Step index="3" title="Deposit USDC" body="Your wallet sends the entry USDC when escrow is open." />
        <Step index="4" title="Keep unused USDC" body="If a player misses, escrow halts risk and leaves unstreamed USDC claimable." />
      </div>
    </div>
  )
}

function ArenaSettings({ timer, setTimer, startRule, setStartRule }: { timer: number; setTimer: (value: number) => void; startRule: StartRule; setStartRule: (value: StartRule) => void }) {
  return (
    <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
      <div className="flex items-center gap-2">
        <Settings className="h-4 w-4 text-gray-400" />
        <p className="text-[13px] font-bold text-gray-950 dark:text-white">Room settings</p>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
        These rules shape how tense the room feels before funds stream.
      </p>
      <div className="mt-3 space-y-2.5">
        <RangedNumberSegment
          label="Timer"
          unit="sec"
          value={timer}
          presets={TIMER_OPTIONS}
          bounds={TIMER_BOUNDS}
          onChange={setTimer}
        />
        <SettingControl title="Start rule" value={startRule === 'host' ? 'Host' : 'Full room'} body="Controls when the private game can begin.">
          <button type="button" onClick={() => setStartRule('host')} className={settingChoice(startRule === 'host')}>
            Host
          </button>
          <button type="button" onClick={() => setStartRule('full')} className={settingChoice(startRule === 'full')}>
            Full
          </button>
        </SettingControl>
        <SettingControl title="Answer mode" value="Single" body="Players lock one answer per round.">
          <span className={settingChoice(true)}>Single</span>
          <span className={settingChoice(false)}>Multi soon</span>
        </SettingControl>
        <SettingControl title="Platform fee" value="0.5%" body="Charged only when a paid room completes successfully.">
          <span className={settingChoice(true)}>Fixed</span>
          <span className={settingChoice(false)}>Custom off</span>
        </SettingControl>
        <SettingControl title="Refund rule" value="Protected" body="Only streamed risk enters the pot. Unstreamed USDC remains claimable from escrow.">
          <span className={settingChoice(true)}>Protected</span>
          <span className={settingChoice(false)}>All-in off</span>
        </SettingControl>
      </div>
    </div>
  )
}

function LeaderboardCard({
  total,
  joined,
  active,
  status,
  round,
  currentPlayerJoined,
}: {
  total: number
  joined: number
  active: number
  status: RoomStatus
  round: number
  currentPlayerJoined: boolean
}) {
  const seats = Array.from({ length: total }, (_, index) => {
    const filled = index < joined
    return {
      seat: index + 1,
      filled,
      active: filled && index < active,
      label: currentPlayerJoined && index === 0 ? 'You' : `P${index + 1}`,
    }
  })
  const showScores = status === 'playing' || status === 'eliminated' || status === 'won'

  return (
    <div className="overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
      <div className="bg-gray-950 px-3.5 pb-3 pt-3 text-white dark:bg-white dark:text-gray-950">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">{showScores ? 'Live leaderboard' : 'Room seats'}</p>
          <p className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold dark:bg-gray-100">
            {showScores ? `Round ${round}` : `${joined}/${total}`}
          </p>
        </div>
        <div className="mt-2.5 rounded-2xl bg-white/10 p-3 dark:bg-gray-100">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 dark:text-gray-500">
            <span>{status === 'lobby' ? 'Waiting room' : 'Game room'}</span>
            <span>{active} active</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15 dark:bg-gray-200">
            <div
              className="h-full rounded-full bg-white transition-all dark:bg-gray-950"
              style={{ width: `${percent(total ? joined / total : 0)}` }}
            />
          </div>
          <p className="mt-2 text-[11px] font-semibold leading-relaxed text-white/58 dark:text-gray-500">
            {showScores
              ? 'Scores will update from paid trivia rounds. No demo players are shown.'
              : 'Only funded seats appear here. The leaderboard starts after the room begins.'}
          </p>
        </div>
      </div>
      <div className="space-y-1.5 p-2.5">
        {seats.map(player => (
          <div
            key={player.seat}
            className={[
              'flex items-center gap-2.5 rounded-2xl p-2',
              player.filled ? 'bg-gray-50 dark:bg-white/[0.04]' : 'bg-gray-50/60 opacity-70 dark:bg-white/[0.025]',
            ].join(' ')}
          >
            <p className="w-5 text-center text-[12px] font-bold text-gray-400">{player.seat}</p>
            <Avatar name={player.filled ? player.label : 'Open'} muted={!player.filled} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-gray-950 dark:text-white">
                {player.filled ? player.label : 'Open seat'}
              </p>
              <p className="truncate text-[10px] font-semibold text-gray-400">
                {player.filled ? 'Escrow funded' : 'Invite pending'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-bold text-gray-950 dark:text-white">
                {showScores && player.filled ? '0' : player.filled ? 'Ready' : '-'}
              </p>
              <p className="text-[10px] font-semibold text-gray-400">
                {player.filled ? (player.active ? 'Active' : 'Funded') : 'Open'}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Avatar({ name, large = false, muted = false }: { name: string; large?: boolean; muted?: boolean }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div className={[
      'grid shrink-0 place-items-center rounded-full border border-white/20 bg-gray-200 font-black text-gray-800 dark:bg-white/10 dark:text-white',
      large ? 'h-9 w-9 text-[11px]' : 'h-8 w-8 text-[10px]',
      muted ? 'opacity-45' : '',
    ].join(' ')}>
      {initials}
    </div>
  )
}

function Step({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gray-950 text-[10px] font-bold text-white dark:bg-white dark:text-gray-950">{index}</span>
      <div>
        <p className="text-[12px] font-bold text-gray-950 dark:text-white">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">{body}</p>
      </div>
    </div>
  )
}

function SettingControl({ title, value, body, children }: { title: string; value: string; body: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl bg-gray-50 p-2.5 dark:bg-white/[0.04]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-bold text-gray-950 dark:text-white">{title}</p>
        <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-gray-700 shadow-sm dark:bg-white/10 dark:text-gray-200">
          {value}
        </span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-gray-400">{body}</p>
      <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-white p-1 dark:border-white/10 dark:bg-white/5">
        {children}
      </div>
    </div>
  )
}

function settingChoice(active: boolean) {
  return [
    'rounded-xl px-2 py-1.5 text-center text-[10px] font-black transition-all',
    active
      ? 'bg-gray-950 text-white shadow-sm dark:bg-white dark:text-gray-950'
      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
  ].join(' ')
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'min-h-9 rounded-xl px-2 text-[11px] font-bold transition-all',
        active
          ? 'bg-white text-gray-950 shadow-sm dark:bg-white dark:text-gray-950'
          : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

function Segment({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-[10px] font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
        {children}
      </div>
    </div>
  )
}

function RangedNumberSegment({ label, unit, value, presets, bounds, onChange }: {
  label: string
  unit?: string
  value: number
  presets: number[]
  bounds: { min: number; max: number }
  onChange: (next: number) => void
}) {
  const [input, setInput] = useState(String(value))
  useEffect(() => { setInput(String(value)) }, [value])
  const parsed = Math.floor(Number(input))
  const valid = Number.isFinite(parsed) && parsed >= bounds.min && parsed <= bounds.max
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold text-gray-500 dark:text-gray-400">{label}</p>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            inputMode="numeric"
            min={bounds.min}
            max={bounds.max}
            value={input}
            onChange={(event) => {
              const next = event.target.value.replace(/[^0-9]/g, '')
              setInput(next)
              const n = Math.floor(Number(next))
              if (Number.isFinite(n) && n >= bounds.min && n <= bounds.max) onChange(n)
            }}
            onBlur={() => {
              if (!valid) setInput(String(value))
            }}
            className={[
              'w-20 rounded-full border bg-white px-2.5 py-1 text-right text-[12px] font-black tabular-nums shadow-sm outline-none transition-colors dark:bg-white/10',
              valid
                ? 'border-gray-100 text-gray-900 focus:border-gray-300 dark:border-white/10 dark:text-white dark:focus:border-white/30'
                : 'border-red-300 text-red-600 focus:border-red-400 dark:border-red-400/40 dark:text-red-300',
            ].join(' ')}
          />
          {unit && <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{unit}</span>}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
        {presets.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => { onChange(option); setInput(String(option)) }}
            className={segmentButton(value === option)}
          >
            {option}
          </button>
        ))}
      </div>
      {!valid && (
        <p className="mt-1 text-[10px] font-semibold text-red-500 dark:text-red-300">
          Choose {bounds.min}–{bounds.max}{unit ? ` ${unit}` : ''}.
        </p>
      )}
    </div>
  )
}

function segmentButton(active: boolean) {
  return [
    'rounded-xl px-2 py-1.5 text-[11px] font-bold transition-all',
    active
      ? 'bg-white text-gray-950 shadow-sm dark:bg-white dark:text-gray-950'
      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
  ].join(' ')
}

function Metric({ label, value, icon, compact = false }: { label: string; value: string; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={['rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-[#111216]', compact ? 'p-2' : 'p-2.5'].join(' ')}>
      <div className="flex items-center gap-1.5 text-gray-400">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-1 text-[12px] font-bold text-gray-950 dark:text-white">{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: RoomStatus }) {
  const label = status === 'setup' ? 'Setup' : status === 'lobby' ? 'Lobby' : status === 'playing' ? 'Live' : status === 'won' ? 'Won' : 'Halted'
  return (
    <span className={[
      'rounded-full px-2.5 py-1 text-[10px] font-bold',
      status === 'playing'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : status === 'lobby'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
        : status === 'eliminated'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300',
    ].join(' ')}>
      {label}
    </span>
  )
}
