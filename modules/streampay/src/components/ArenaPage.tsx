import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { Clock3, LockKeyhole, Play, RotateCcw, Trophy, WalletCards, Zap } from 'lucide-react'

type RiskMode = 'linear' | 'climb' | 'finale'
type RoomStatus = 'setup' | 'playing' | 'eliminated' | 'won'

const ENTRY_OPTIONS = [10, 50, 200]
const PLAYER_OPTIONS = [2, 5, 10]
const ROUND_OPTIONS = [10, 15]

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
  const [selected, setSelected] = useState('')
  const [roomLog, setRoomLog] = useState('Room preview ready')

  const activeQuestion = SAMPLE_QUESTIONS[(round - 1) % SAMPLE_QUESTIONS.length]
  const maxPool = entry * players
  const currentStreamed = streamedThrough(round - 1, rounds, riskMode, entry)
  const nextRoundCost = entry * roundWeight(round, rounds, riskMode)
  const remaining = Math.max(entry - currentStreamed, 0)
  const prizePool = currentStreamed * players
  const lateRisk = entry * roundWeight(rounds, rounds, riskMode)

  const timeline = useMemo(() => {
    const keyRounds = [1, Math.ceil(rounds / 2), rounds]
    return keyRounds.map(item => ({
      round: item,
      streamed: streamedThrough(item, rounds, riskMode, entry),
      refund: Math.max(entry - streamedThrough(item, rounds, riskMode, entry), 0),
    }))
  }, [entry, riskMode, rounds])

  useEffect(() => {
    if (status !== 'playing') return
    setSeconds(60)
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
  }, [round, status])

  function startRoom() {
    setStatus('playing')
    setRound(1)
    setSelected('')
    setRoomLog('Live. Answer before the timer ends.')
  }

  function resetRoom() {
    setStatus('setup')
    setRound(1)
    setSeconds(60)
    setSelected('')
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
    setRoomLog('Correct. Next round is worth more.')
  }

  return (
    <div className="mx-auto mt-6 w-full max-w-5xl px-0 pb-8 sm:mt-8">
      <div className="grid gap-4 lg:grid-cols-[0.86fr_1.14fr]">
        <section className="space-y-4">
          <div className="space-y-2 rounded-[26px] border border-gray-100 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500 dark:bg-white/10 dark:text-gray-300">
              <Zap className="h-3 w-3" />
              StreamPay Arena
            </p>
            <h1 className="text-[27px] font-bold tracking-tight text-gray-950 dark:text-white sm:text-[32px]">
              Play with USDC, keep what you do not risk.
            </h1>
            <p className="max-w-[520px] text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
              Join timed game rooms where your deposit streams only while you are still in the round.
            </p>
            <div className="grid grid-cols-3 gap-2 pt-1">
              {[
                ['Wallet', 'Circle'],
                ['Network', 'Arc'],
                ['Asset', 'USDC'],
              ].map(([title, body]) => (
                <div key={title} className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{title}</p>
                  <p className="mt-1 text-[13px] font-bold text-gray-950 dark:text-white">{body}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-gray-100 bg-white p-3 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                { title: 'Trivia', body: 'Live demo', active: true },
                { title: 'Prediction', body: 'Soon' },
                { title: 'Creator', body: 'Soon' },
              ].map(item => (
                <GameTile key={item.title} title={item.title} body={item.body} active={item.active} />
              ))}
            </div>
          </div>

          <div className="rounded-[22px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-bold text-gray-950 dark:text-white">Create room</p>
                <p className="mt-0.5 text-[11px] text-gray-400">Set the stake, players, and risk curve.</p>
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold text-gray-500 dark:bg-white/10 dark:text-gray-300">
                Preview
              </span>
            </div>

            <div className="mt-4 rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
              <div className="grid grid-cols-3 gap-2">
                <Metric label="Prize" value={`$${money(maxPool)}`} compact />
                <Metric label="Start risk" value={`$${money(entry * roundWeight(1, rounds, riskMode))}`} compact />
                <Metric label="End risk" value={`$${money(lateRisk)}`} compact />
              </div>
            </div>

            <div className="mt-4 space-y-4">
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
              onClick={startRoom}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gray-950 py-3.5 text-[13px] font-bold text-white transition-transform active:scale-[0.98] dark:bg-white dark:text-gray-950"
            >
              <Play className="h-4 w-4" />
              Play demo room
            </button>
          </div>
        </section>

        <section className="rounded-[28px] border border-gray-100 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-[#111216] sm:p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold text-gray-950 dark:text-white">Trivia room</p>
              <p className="mt-0.5 text-[11px] text-gray-400">{entry} USDC entry · {players} players</p>
            </div>
            <StatusPill status={status} />
          </div>

          <div className="mt-4 rounded-[26px] bg-gray-950 p-4 text-white dark:bg-white dark:text-gray-950">
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

            <div className="mt-5 rounded-2xl bg-white/10 p-4 dark:bg-gray-100">
              <p className="text-[17px] font-bold leading-snug text-white dark:text-gray-950">{activeQuestion.prompt}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {activeQuestion.options.map(option => (
                  <button
                    key={option}
                    type="button"
                    disabled={status !== 'playing'}
                    onClick={() => submitAnswer(option)}
                    className={[
                      'min-h-11 rounded-xl border px-3 text-left text-[12px] font-semibold transition-all',
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

          <div className="mt-4 grid grid-cols-3 gap-2">
            <Metric icon={<LockKeyhole className="h-3.5 w-3.5" />} label="Yours" value={`$${money(remaining)}`} />
            <Metric icon={<WalletCards className="h-3.5 w-3.5" />} label="Pot" value={`$${money(prizePool)}`} />
            <Metric icon={<Trophy className="h-3.5 w-3.5" />} label="Next" value={`$${money(nextRoundCost)}`} />
          </div>

          <div className="mt-4 rounded-[22px] border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[12px] font-bold text-gray-950 dark:text-white">{roomLog}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-gray-400">
                  If you stop now, your unstreamed balance stays yours.
                </p>
              </div>
              {(status === 'eliminated' || status === 'won') && (
                <button
                  type="button"
                  onClick={resetRoom}
                  className="shrink-0 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-gray-600 transition-colors hover:bg-white dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-[22px] border border-gray-100 p-4 dark:border-white/10">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[12px] font-bold text-gray-950 dark:text-white">Risk path</p>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400">{riskLabel(riskMode)}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              {timeline.map(item => (
                <div key={item.round} className="rounded-2xl bg-gray-50 p-3 dark:bg-white/[0.04]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">R{item.round}</p>
                  <p className="mt-1 text-[13px] font-bold text-gray-950 dark:text-white">${money(item.refund)} left</p>
                </div>
              ))}
            </div>
          </div>

        </section>
      </div>
    </div>
  )
}

function GameTile({ title, body, active = false }: { title: string; body: string; active?: boolean }) {
  return (
    <div className={[
      'rounded-2xl border p-3',
      active
        ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950'
        : 'border-gray-100 bg-gray-50 text-gray-400 dark:border-white/10 dark:bg-white/5',
    ].join(' ')}>
      <p className="text-[11px] font-bold">{title}</p>
      <p className={['mt-1 text-[10px]', active ? 'text-white/70 dark:text-gray-500' : 'text-gray-400'].join(' ')}>{body}</p>
    </div>
  )
}

function Segment({ label, value, children }: { label: string; value: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">{label}</p>
        <p className="text-[11px] font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/5">
        {children}
      </div>
    </div>
  )
}

function segmentButton(active: boolean) {
  return [
    'rounded-xl px-2 py-2 text-[11px] font-bold transition-all',
    active
      ? 'bg-white text-gray-950 shadow-sm dark:bg-white dark:text-gray-950'
      : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-200',
  ].join(' ')
}

function Metric({ label, value, icon, compact = false }: { label: string; value: string; icon?: ReactNode; compact?: boolean }) {
  return (
    <div className={['rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-[#111216]', compact ? 'p-2.5' : 'p-3'].join(' ')}>
      <div className="flex items-center gap-1.5 text-gray-400">
        {icon}
        <p className="text-[10px] font-bold uppercase tracking-[0.12em]">{label}</p>
      </div>
      <p className="mt-1 text-[13px] font-bold text-gray-950 dark:text-white">{value}</p>
    </div>
  )
}

function StatusPill({ status }: { status: RoomStatus }) {
  const label = status === 'setup' ? 'Ready' : status === 'playing' ? 'Live' : status === 'won' ? 'Won' : 'Halted'
  return (
    <span className={[
      'rounded-full px-2.5 py-1 text-[10px] font-bold',
      status === 'playing'
        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
        : status === 'eliminated'
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
          : 'bg-gray-100 text-gray-500 dark:bg-white/10 dark:text-gray-300',
    ].join(' ')}>
      {label}
    </span>
  )
}
