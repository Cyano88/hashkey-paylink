import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowLeft, Clock3, Crown, LockKeyhole, Play, RotateCcw, Settings, Share2, Shield, Sparkles, Trophy, Users, WalletCards } from 'lucide-react'

type RiskMode = 'linear' | 'climb' | 'finale'
type RoomStatus = 'setup' | 'lobby' | 'playing' | 'eliminated' | 'won'
type ArenaTab = 'room' | 'how' | 'settings'
type ArenaView = 'games' | 'mode' | 'private'
type StartRule = 'host' | 'full'
type PaymentStatus = 'escrow_pending' | 'deposit_open' | 'funded' | 'settled'

type SavedArenaRoom = {
  roomId: string
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
  return roomParam ? 'private' : 'mode'
}

function readInitialRoomId() {
  if (typeof window === 'undefined') return ''
  const params = new URLSearchParams(window.location.search)
  if (params.get('game') !== 'trivia') return ''
  const roomParam = String(params.get('room') ?? '').trim().toUpperCase()
  return /^SP-[A-F0-9]{6}$/.test(roomParam) ? roomParam : ''
}

const ENTRY_OPTIONS = [10, 50, 200]
const PLAYER_OPTIONS = [2, 5, 10]
const ROUND_OPTIONS = [10, 15]
const TIMER_OPTIONS = [45, 60, 90]
const PLATFORM_FEE_BPS = 50
const ARENA_ESCROW_FACTORY_ADDRESS = String(import.meta.env.VITE_ARENA_ESCROW_FACTORY_ADDRESS ?? '').trim()
const ESCROW_FACTORY_READY = /^0x[a-fA-F0-9]{40}$/.test(ARENA_ESCROW_FACTORY_ADDRESS)

const SAMPLE_QUESTIONS = [
  {
    prompt: 'Which asset is used for StreamPay settlement?',
    options: ['USDC', 'ETH', 'SOL', 'BTC'],
    answer: 'USDC',
  },
  {
    prompt: 'What happens when a player misses a round?',
    options: ['Their stream halts', 'They lose all funds', 'Room restarts', 'Timer doubles'],
    answer: 'Their stream halts',
  },
  {
    prompt: 'Which network is StreamPay Arena designed around?',
    options: ['Arc', 'Dogecoin', 'Litecoin', 'Ripple'],
    answer: 'Arc',
  },
]

const LEADERBOARD = [
  { rank: 1, name: 'Dami', handle: '@dami23', score: 1520, status: 'Alive' },
  { rank: 2, name: 'Athena', handle: '@athena', score: 1410, status: 'Alive' },
  { rank: 3, name: 'Horus', handle: '@horus4', score: 1355, status: 'Alive' },
  { rank: 4, name: 'Favour', handle: '@favortech', score: 1180, status: 'Halted' },
  { rank: 5, name: 'Falcon', handle: '@falcon02', score: 980, status: 'Halted' },
  { rank: 6, name: 'Gemini', handle: '@gemini', score: 760, status: 'Halted' },
]

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

function percent(value: number) {
  return `${Math.round(value * 100)}%`
}

export function ArenaPage() {
  const [entry, setEntry] = useState(10)
  const [players, setPlayers] = useState(5)
  const [rounds, setRounds] = useState(15)
  const [riskMode, setRiskMode] = useState<RiskMode>('climb')
  const [status, setStatus] = useState<RoomStatus>('setup')
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

  const activeQuestion = SAMPLE_QUESTIONS[(round - 1) % SAMPLE_QUESTIONS.length]
  const maxPool = entry * players
  const platformFee = (maxPool * platformFeeBps) / 10000
  const netPrize = Math.max(maxPool - platformFee, 0)
  const currentStreamed = streamedThrough(round - 1, rounds, riskMode, entry)
  const nextRoundCost = entry * roundWeight(round, rounds, riskMode)
  const remaining = Math.max(entry - currentStreamed, 0)
  const prizePool = currentStreamed * players
  const draftRoomCode = useMemo(() => `SP-${entry}${players}${rounds}-${riskMode.slice(0, 2).toUpperCase()}`, [entry, players, riskMode, rounds])
  const roomCode = savedRoomId || draftRoomCode
  const joinedPlayers = status === 'setup' ? 1 : status === 'lobby' ? Math.min(players, Math.max(2, Math.ceil(players * 0.6))) : players
  const canStartGame = startRule === 'host' || joinedPlayers >= players
  const canOpenDeposits = ESCROW_FACTORY_READY && Boolean(escrowAddress) && paymentStatus !== 'escrow_pending'
  const riskProgress = Math.min(100, Math.round((currentStreamed / entry) * 100))
  const alivePlayers = status === 'playing' ? Math.max(1, players - Math.floor(round / 4)) : status === 'eliminated' ? players - 1 : players
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

    if (ENTRY_OPTIONS.includes(entryParam)) setEntry(entryParam)
    if (PLAYER_OPTIONS.includes(playersParam)) setPlayers(playersParam)
    if (ROUND_OPTIONS.includes(roundsParam)) setRounds(roundsParam)
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

  async function loadSavedRoom(roomId: string) {
    try {
      const response = await fetch(`/api/arena-room?id=${encodeURIComponent(roomId)}`)
      const data = await response.json() as { ok?: boolean; room?: SavedArenaRoom; error?: string }
      if (!response.ok || !data.ok || !data.room) throw new Error(data.error ?? 'Arena room not found.')
      const room = data.room
      setEntry(room.entry)
      setPlayers(room.players)
      setRounds(room.rounds)
      setRiskMode(room.riskMode)
      setRoomTimer(room.timer)
      setStartRule(room.startRule)
      setSavedRoomId(room.roomId)
      setPaymentStatus(room.paymentStatus ?? 'escrow_pending')
      setEscrowAddress(room.escrowAddress ?? null)
      setPlatformFeeBps(Number.isFinite(room.platformFeeBps) ? room.platformFeeBps : PLATFORM_FEE_BPS)
      setView('private')
      setActiveTab('room')
      setStatus('lobby')
      setRound(1)
      setSeconds(room.timer)
      setSelected('')
      setRoomLog('Private room loaded. Deposits open after Arena escrow is configured.')
    } catch (error) {
      setView('private')
      setActiveTab('room')
      setStatus('setup')
      setRoomLog(error instanceof Error ? error.message : 'Arena room could not be loaded.')
    }
  }

  useEffect(() => {
    if (status !== 'playing') return
    setSeconds(roomTimer)
    const timer = window.setInterval(() => {
      setSeconds(value => {
        if (value <= 1) {
          window.clearInterval(timer)
          setStatus('eliminated')
          setRoomLog('Timer expired. Your stream halted and the remaining balance is claimable.')
          return 0
        }
        return value - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [roomTimer, round, status])

  async function createLobby() {
    setRoomSaving(true)
    try {
      const response = await fetch('/api/arena-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entry, players, rounds, riskMode, timer: roomTimer, startRule }),
      })
      const data = await response.json() as { ok?: boolean; room?: SavedArenaRoom; error?: string }
      if (!response.ok || !data.ok || !data.room) throw new Error(data.error ?? 'Arena room could not be saved.')

      setSavedRoomId(data.room.roomId)
      setPaymentStatus(data.room.paymentStatus ?? 'escrow_pending')
      setEscrowAddress(data.room.escrowAddress ?? null)
      setPlatformFeeBps(Number.isFinite(data.room.platformFeeBps) ? data.room.platformFeeBps : PLATFORM_FEE_BPS)
      setStatus('lobby')
      setRound(1)
      setSeconds(roomTimer)
      setSelected('')
      setRoomLog('Private lobby saved. Share the room link; USDC deposits unlock after escrow is live.')
    } catch (error) {
      setRoomLog(error instanceof Error ? error.message : 'Arena room could not be saved.')
    } finally {
      setRoomSaving(false)
    }
  }

  function startRoom() {
    if (!canOpenDeposits || !canStartGame) {
      setRoomLog('Paid rooms require the Arena escrow factory and room escrow before deposits or live play can start.')
      return
    }
    setStatus('playing')
    setRound(1)
    setSeconds(roomTimer)
    setSelected('')
    setRoomLog('Round 1 live. Escrowed risk stream has started.')
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
    setRoomLog('Room preview ready')
  }

  function submitAnswer(option: string) {
    if (status !== 'playing') return
    setSelected(option)
    if (option !== activeQuestion.answer) {
      setStatus('eliminated')
      setRoomLog('Stopped. Your remaining USDC is still claimable.')
      return
    }
    if (round >= rounds) {
      setStatus('won')
      setRoomLog('Winner. Prize pool is ready to claim.')
      return
    }
    setRound(value => value + 1)
    setSelected('')
    setRoomLog(`Correct. Round ${round + 1} unlocks a higher risk stream.`)
  }

  async function shareRoomLink() {
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'StreamPay Arena private room',
          text: `Join my Stream Trivia room ${roomCode}`,
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
    setView('mode')
    setActiveTab('room')
    resetRoom()
  }

  function openPrivateRoom() {
    setView('private')
    setActiveTab('room')
    resetRoom()
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
            ['Wallet', 'Circle'],
            ['Network', 'Arc'],
            ['Mode', view === 'games' ? 'Lobby' : view === 'mode' ? 'Trivia' : 'Private'],
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

      {view === 'mode' && (
        <div className="space-y-3">
          <BackButton onClick={() => setView('games')}>Games</BackButton>
          <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <p className="text-[13px] font-bold text-gray-950 dark:text-white">Choose room type</p>
            <div className="mt-3 grid max-w-lg gap-2">
              <RoomModeButton
                active
                icon={<Shield className="h-4 w-4" />}
                title="Private room"
                body="Create a link and invite close friends."
                onClick={openPrivateRoom}
              />
              <RoomModeButton
                active={false}
                icon={<Users className="h-4 w-4" />}
                title="Public room"
                body="Open matchmaking is coming soon."
                onClick={() => undefined}
                disabled
              />
            </div>
          </div>
        </div>
      )}

      {view === 'private' && (
        <div className="grid gap-3 lg:grid-cols-[minmax(250px,0.68fr)_minmax(460px,1.32fr)]">
          <section className="space-y-3">
            <BackButton onClick={() => setView('mode')}>Trivia rooms</BackButton>
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
                  <Segment label="Entry" value={`${entry} USDC`}>
                    {ENTRY_OPTIONS.map(value => (
                      <button key={value} type="button" onClick={() => setEntry(value)} className={segmentButton(entry === value)}>
                        {value}
                      </button>
                    ))}
                  </Segment>

                  <Segment label="Players" value={`${players}`}>
                    {PLAYER_OPTIONS.map(value => (
                      <button key={value} type="button" onClick={() => setPlayers(value)} className={segmentButton(players === value)}>
                        {value}
                      </button>
                    ))}
                  </Segment>

                  <Segment label="Rounds" value={`${rounds}`}>
                    {ROUND_OPTIONS.map(value => (
                      <button key={value} type="button" onClick={() => setRounds(value)} className={segmentButton(rounds === value)}>
                        {value}
                      </button>
                    ))}
                  </Segment>

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
                  disabled={roomSaving}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 py-2.5 text-[12px] font-bold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-gray-950"
                >
                  <Play className="h-4 w-4" />
                  {roomSaving ? 'Saving lobby...' : 'Create private lobby'}
                </button>
              </div>
            )}

            {activeTab === 'room' && status !== 'setup' && (
              <div className="rounded-[22px] border border-gray-100 bg-white p-3.5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[13px] font-bold text-gray-950 dark:text-white">Room</p>
                    <p className="mt-0.5 text-[11px] text-gray-400">{roomCode} · 0.5% fee on completed room</p>
                  </div>
                  <StatusPill status={status} />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Metric label="Entry" value={`${entry} USDC`} compact />
                  <Metric label="Players" value={`${joinedPlayers}/${players}`} compact />
                  <Metric label="Prize" value={`$${money(netPrize)}`} compact />
                  <Metric label="Escrow" value={escrowAddress ? 'Room ready' : ESCROW_FACTORY_READY ? 'Factory ready' : 'Pending'} compact />
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
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold text-gray-950 dark:text-white">Trivia room</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{roomCode} - {entry} USDC - {players} players</p>
                </div>
                <StatusPill status={status} />
              </div>

              <div className="mt-3 overflow-hidden rounded-[22px] bg-gray-950 p-4 text-white dark:bg-white dark:text-gray-950 sm:p-4">
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

                {status === 'lobby' && (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45 dark:text-gray-500">Private lobby</p>
                        <h2 className="mt-1 text-[19px] font-black leading-tight">Lobby saved</h2>
                      </div>
                      <p className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-black dark:bg-gray-100">
                        {joinedPlayers}/{players}
                      </p>
                    </div>
                    <PlayerSlots total={players} joined={joinedPlayers} />
                    <button
                      type="button"
                      onClick={startRoom}
                      disabled={!canOpenDeposits || !canStartGame}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-2.5 text-[12px] font-black text-gray-950 transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45 dark:bg-gray-950 dark:text-white"
                    >
                      <Play className="h-4 w-4" />
                      {canOpenDeposits ? (canStartGame ? 'Start paid room' : 'Waiting for full room') : 'Room escrow required'}
                    </button>
                    <p className="mt-2 text-center text-[10px] font-semibold text-white/45 dark:text-gray-500">
                      No platform account required. Players use Circle wallet access when deposits open.
                    </p>
                  </div>
                )}

                {(status === 'playing' || status === 'eliminated' || status === 'won') && (
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
                      <p className="text-[15px] font-bold leading-snug text-white dark:text-gray-950">{activeQuestion.prompt}</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {activeQuestion.options.map(option => (
                          <button
                            key={option}
                            type="button"
                            disabled={status !== 'playing'}
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
                    </div>
                  </div>
                )}
              </div>

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

            <div className="mt-3 rounded-[20px] border border-gray-100 bg-gray-50 p-3.5 dark:border-white/10 dark:bg-white/[0.04]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[12px] font-bold text-gray-950 dark:text-white">{roomLog}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                    {status === 'won'
                      ? 'Prize claim will be wired to the Arc room vault.'
                      : status === 'eliminated'
                        ? 'Your stream stopped. Only streamed risk stays in the pot.'
                        : status === 'setup'
                          ? 'Room is not live yet. Create the lobby when your settings look right.'
                          : status === 'lobby'
                            ? `Escrow pending. Net prize after 0.5% platform fee: $${money(netPrize)}.`
                            : `${alivePlayers} players active. Unstreamed USDC stays claimable from escrow.`}
                  </p>
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
            </div>
          </div>

          <LeaderboardCard />
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
    <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 dark:border-gray-200 dark:bg-gray-100">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/45 dark:text-gray-500">{label}</p>
      <p className="mt-1 truncate text-[12px] font-black text-white dark:text-gray-950">{value}</p>
    </div>
  )
}

function PlayerSlots({ total, joined }: { total: number; joined: number }) {
  return (
    <div className="mt-4">
      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: total }, (_, index) => {
          const active = index < joined
          return (
            <div
              key={index}
              className={[
                'flex min-h-11 flex-col items-center justify-center rounded-2xl border text-center',
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
        <Step index="2" title="Invite players" body="Share the private link. No platform account is required." />
        <Step index="3" title="Deposit with Circle" body="When escrow is live, each player uses wallet access to deposit Arc USDC." />
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
        <SettingControl title="Timer" value={`${timer}s`} body="Controls how long each question stays open.">
          {TIMER_OPTIONS.map(option => (
            <button key={option} type="button" onClick={() => setTimer(option)} className={settingChoice(timer === option)}>
              {option}s
            </button>
          ))}
        </SettingControl>
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

function LeaderboardCard() {
  const top = LEADERBOARD.slice(0, 3)
  const rows = LEADERBOARD.slice(3)
  return (
    <div className="overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#111216]">
      <div className="bg-gray-950 px-3.5 pb-3.5 pt-3 text-white dark:bg-white dark:text-gray-950">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold">Room leaderboard</p>
          <p className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-bold dark:bg-gray-100">Round 1</p>
        </div>
        <div className="mt-3 grid grid-cols-3 items-end gap-2">
          <Podium player={top[1]} height="h-14" tone="bg-white/10 dark:bg-gray-100" />
          <Podium player={top[0]} height="h-20" tone="bg-white text-gray-950 dark:bg-gray-950 dark:text-white" />
          <Podium player={top[2]} height="h-12" tone="bg-white/10 dark:bg-gray-100" />
        </div>
      </div>
      <div className="space-y-1.5 p-2">
        {rows.map(player => (
          <div key={player.rank} className="flex items-center gap-2.5 rounded-2xl bg-gray-50 p-2 dark:bg-white/[0.04]">
            <p className="w-5 text-center text-[12px] font-bold text-gray-400">{player.rank}</p>
            <Avatar name={player.name} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-bold text-gray-950 dark:text-white">{player.name}</p>
              <p className="truncate text-[10px] font-semibold text-gray-400">{player.handle}</p>
            </div>
            <div className="text-right">
              <p className="text-[12px] font-bold text-gray-950 dark:text-white">{player.score}</p>
              <p className="text-[10px] font-semibold text-gray-400">{player.status}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Podium({ player, height, tone }: { player: typeof LEADERBOARD[number]; height: string; tone: string }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-2 flex flex-col items-center">
        <Avatar name={player.name} large />
        <p className="mt-1 truncate text-[11px] font-bold">{player.name}</p>
        <p className="text-[9px] font-semibold opacity-60">{player.score}</p>
      </div>
      <div className={`flex ${height} items-center justify-center rounded-t-2xl ${tone}`}>
        <span className="text-[19px] font-black">{player.rank}</span>
      </div>
    </div>
  )
}

function Avatar({ name, large = false }: { name: string; large?: boolean }) {
  const initials = name.slice(0, 2).toUpperCase()
  return (
    <div className={[
      'grid shrink-0 place-items-center rounded-full border border-white/20 bg-gray-200 font-black text-gray-800 dark:bg-white/10 dark:text-white',
      large ? 'h-9 w-9 text-[11px]' : 'h-8 w-8 text-[10px]',
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

function RoomModeButton({ active, icon, title, body, onClick, disabled = false }: { active: boolean; icon: ReactNode; title: string; body: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-2xl border p-2.5 text-left transition-all disabled:cursor-not-allowed',
        active
          ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
          : disabled
            ? 'border-gray-100 bg-gray-50 text-gray-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-gray-500'
            : 'border-gray-100 bg-gray-50 text-gray-500 hover:border-gray-200 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-300',
      ].join(' ')}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="text-[12px] font-bold">{title}</p>
      </div>
      <p className={['mt-1 text-[10px] leading-snug', active ? 'text-white/65 dark:text-gray-500' : 'text-gray-400'].join(' ')}>{body}</p>
    </button>
  )
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
