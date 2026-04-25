import { useState } from 'react'
import {
  useAccount, useChainId, useSwitchChain,
  useReadContract, useWriteContract, usePublicClient,
} from 'wagmi'
import { useConnectModal } from '@rainbow-me/rainbowkit'
import { isAddress, parseAbi, parseEventLogs } from 'viem'
import { STREAM_VAULT_FACTORY_ABI } from '../lib/streamVaultAbi'
import { formatUsdcFull } from './TriStateBar'

// ── Arc constants ─────────────────────────────────────────────────────────────
const ARC_CHAIN_ID = 5042002
const ARC_USDC     = '0x3600000000000000000000000000000000000000' as const
const ARC_EXPLORER = 'https://testnet.arcscan.app'

const ERC20_ABI = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
])

// ── Duration presets ──────────────────────────────────────────────────────────
const DURATIONS = [
  { label: '1 hr',    secs: 3_600n },
  { label: '8 hrs',   secs: 28_800n },
  { label: '24 hrs',  secs: 86_400n },
  { label: '7 days',  secs: 604_800n },
  { label: '30 days', secs: 2_592_000n },
]

type Step = 'form' | 'funding' | 'creating' | 'success'

function parseUsdc(val: string): bigint {
  const n = parseFloat(val)
  if (!isFinite(n) || n <= 0) return 0n
  return BigInt(Math.round(n * 1_000_000))
}

function genSalt(): `0x${string}` {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return `0x${[...arr].map(b => b.toString(16).padStart(2, '0')).join('')}` as `0x${string}`
}

// ── StreamPay "O" logo ────────────────────────────────────────────────────────
function StreamPayLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="9" cy="9" r="7.5" stroke="#00FF41" strokeWidth="2" />
      <circle cx="9" cy="9" r="3.5" fill="#00FF41" />
    </svg>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CreateStreamForm() {
  const { address: connectedAddr, isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain }        = useSwitchChain()
  const { openConnectModal }   = useConnectModal()
  const { writeContractAsync } = useWriteContract()
  const publicClient           = usePublicClient({ chainId: ARC_CHAIN_ID })

  const isOnArc     = chainId === ARC_CHAIN_ID
  const factoryAddr = (import.meta.env.VITE_STREAM_FACTORY_ADDRESS ?? '') as `0x${string}`

  // ── Form state ────────────────────────────────────────────────────────────
  const [recipient,      setRecipient]      = useState('')
  const [amount,         setAmount]         = useState('')
  const [durationPreset, setDurationPreset] = useState<bigint | null>(null)
  const [customDays,     setCustomDays]     = useState('')
  const [salt] = useState<`0x${string}`>(genSalt)

  // ── Tx state ──────────────────────────────────────────────────────────────
  const [step,         setStep]         = useState<Step>('form')
  const [statusMsg,    setStatusMsg]    = useState('')
  const [error,        setError]        = useState<string | null>(null)
  const [streamLink,   setStreamLink]   = useState<string | null>(null)
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null)

  // ── Derived values ────────────────────────────────────────────────────────
  const recipientValid = isAddress(recipient)
  const amountBn       = parseUsdc(amount)
  const amountValid    = amountBn > 0n
  const durationSecs   = durationPreset
    ?? (customDays ? BigInt(Math.round(parseFloat(customDays) * 86400)) : 0n)
  const durationValid  = durationSecs > 0n
  const isFormValid    = recipientValid && amountValid && durationValid && isConnected && isOnArc && !!factoryAddr

  // ── USDC balance ──────────────────────────────────────────────────────────
  const { data: usdcBalance } = useReadContract({
    address:      ARC_USDC,
    abi:          ERC20_ABI,
    functionName: 'balanceOf',
    args:         [connectedAddr ?? '0x0000000000000000000000000000000000000000'],
    query:        { enabled: !!connectedAddr && isOnArc, refetchInterval: 10_000 },
  })

  const hasEnoughBalance = (usdcBalance ?? 0n) >= amountBn

  // ── Step indicators ───────────────────────────────────────────────────────
  const steps = [
    { label: 'Setup',         done: isFormValid },
    { label: 'Fund Vault',    done: step === 'creating' || step === 'success' },
    { label: 'Deploy Stream', done: step === 'success' },
  ]

  // ── Ghost-vault deploy flow ───────────────────────────────────────────────
  async function handleDeploy() {
    if (!isFormValid || !connectedAddr || !publicClient) return
    setError(null)

    const startTime = BigInt(Math.floor(Date.now() / 1000) + 120)
    const endTime   = startTime + durationSecs

    try {
      const predicted = await publicClient.readContract({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'getVaultAddress',
        args:         [connectedAddr, recipient as `0x${string}`, amountBn, startTime, endTime, salt],
      }) as `0x${string}`

      setStep('funding')
      setStatusMsg('Sign to transfer USDC to vault…')
      const fundTx = await writeContractAsync({
        address: ARC_USDC, abi: ERC20_ABI,
        functionName: 'transfer',
        args: [predicted, amountBn],
        gas: 100_000n,
      })
      setStatusMsg('Confirming transfer on Arc…')
      await publicClient.waitForTransactionReceipt({ hash: fundTx })

      setStep('creating')
      setStatusMsg('Sign to deploy the stream vault…')
      const deployTx = await writeContractAsync({
        address:      factoryAddr,
        abi:          STREAM_VAULT_FACTORY_ABI,
        functionName: 'createStream',
        args:         [recipient as `0x${string}`, amountBn, startTime, endTime, salt],
        gas:          2_000_000n,
      })
      setDeployTxHash(deployTx)
      setStatusMsg('Deploying vault on Arc…')
      const receipt = await publicClient.waitForTransactionReceipt({ hash: deployTx })

      const logs  = parseEventLogs({ abi: STREAM_VAULT_FACTORY_ABI, logs: receipt.logs })
      const event = logs.find(l => l.eventName === 'StreamCreated')
      const vault = (event?.args as { vault?: `0x${string}` })?.vault
      if (!vault) throw new Error('Could not extract vault address from receipt.')

      setStreamLink(`${window.location.origin}/stream/${vault}`)
      setStep('success')
      setStatusMsg('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.toLowerCase().includes('rejected') || msg.toLowerCase().includes('denied')) {
        setStep('form'); setStatusMsg(''); return
      }
      setError(msg.slice(0, 160))
      setStep('form')
    }
  }

  // ── Success screen ────────────────────────────────────────────────────────
  if (step === 'success' && streamLink) {
    return (
      <div className="mx-auto w-full max-w-md font-inter">
        <div className="rounded-2xl border border-gray-100 bg-white shadow-lg">
          <div className="px-8 py-10 text-center space-y-6">

            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
              style={{ background: 'rgba(0,255,65,0.10)', border: '1.5px solid rgba(0,255,65,0.35)' }}>
              <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"
                strokeWidth={2.5} style={{ color: '#00CC33' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <div>
              <p className="text-[16px] font-semibold text-gray-900">Stream Deployed</p>
              <p className="mt-1.5 text-[13px] text-gray-400">
                {formatUsdcFull(amountBn)} USDC streaming to{' '}
                <span className="font-mono text-gray-600">{recipient.slice(0, 6)}…{recipient.slice(-4)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-left space-y-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                Share Stream Link
              </p>
              <p className="break-all font-mono text-[11px] text-gray-500 leading-relaxed">{streamLink}</p>
              <div className="flex gap-2 pt-0.5">
                <button
                  onClick={() => navigator.clipboard.writeText(streamLink)}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-gray-900 py-2.5 text-[12px] font-semibold text-white hover:bg-gray-700 transition-colors"
                >
                  Copy Link
                </button>
                <a href={streamLink}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-2.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                  View Stream
                </a>
              </div>
            </div>

            {deployTxHash && (
              <a href={`${ARC_EXPLORER}/tx/${deployTxHash}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center justify-center gap-1.5 text-[12px] text-gray-400 hover:text-gray-600 transition-colors">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                </svg>
                View on Arcscan
              </a>
            )}
          </div>

          <Footer />
        </div>
      </div>
    )
  }

  // ── Form screen ───────────────────────────────────────────────────────────
  const isWorking = step === 'funding' || step === 'creating'

  return (
    <div className="mx-auto w-full max-w-md font-inter">
      <div className="rounded-2xl border border-gray-100 bg-white shadow-lg">

        {/* ── Header ── */}
        <div className="flex items-center justify-between border-b border-gray-100 px-8 py-5">
          <div className="flex items-center gap-2">
            <StreamPayLogo />
            <span className="text-[13px] font-bold uppercase tracking-widest text-gray-800">
              StreamPay
            </span>
          </div>
          <span className="text-[11px] font-medium uppercase tracking-wider text-gray-400">
            New Stream
          </span>
        </div>

        {/* ── Step indicator ── */}
        <div className="flex items-center border-b border-gray-50 px-8 py-3.5">
          {steps.map((s, i) => (
            <div key={s.label} className="flex items-center">
              <div className="flex items-center gap-1.5">
                <div className={[
                  'flex h-[18px] w-[18px] items-center justify-center rounded-full text-[9px] font-bold',
                  s.done ? 'text-black' : 'bg-gray-100 text-gray-400',
                ].join(' ')}
                  style={s.done ? { background: '#00FF41' } : {}}>
                  {s.done ? '✓' : i + 1}
                </div>
                <span className={`text-[11px] font-medium ${s.done ? 'text-gray-800' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && <div className="mx-3 h-px w-6 bg-gray-100" />}
            </div>
          ))}
        </div>

        {/* ── Fields ── */}
        <div className="space-y-6 px-8 py-8">

          {/* Recipient */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Recipient Wallet
            </label>
            <input
              type="text"
              placeholder="0x… EVM address on Arc"
              value={recipient}
              onChange={e => setRecipient(e.target.value.trim())}
              spellCheck={false}
              disabled={isWorking}
              className={[
                'w-full rounded-xl border bg-gray-50/70 px-4 py-3.5 font-mono text-[13px]',
                'placeholder:text-gray-300 transition-all focus:bg-white focus:outline-none focus:ring-2',
                'disabled:opacity-60',
                recipient && !recipientValid
                  ? 'border-red-200 text-red-500 focus:ring-red-100'
                  : recipientValid
                  ? 'border-emerald-200 text-gray-900 focus:ring-emerald-100'
                  : 'border-gray-200 text-gray-900 focus:border-gray-300 focus:ring-gray-100',
              ].join(' ')}
            />
            {recipient && !recipientValid && (
              <p className="text-[11px] text-red-400">Enter a valid EVM address</p>
            )}
          </div>

          {/* Amount — input-group with inside USDC badge */}
          <div className="space-y-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Total Amount
            </label>
            <div className={[
              'flex items-center rounded-xl border bg-gray-50/70 transition-all',
              'focus-within:border-gray-300 focus-within:bg-white focus-within:ring-2 focus-within:ring-gray-100',
              'border-gray-200',
            ].join(' ')}>
              <input
                type="number"
                placeholder="0.00"
                min="0"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                disabled={isWorking}
                className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-[14px] text-gray-900 placeholder:text-gray-300 focus:outline-none disabled:opacity-60"
              />
              <span className="flex-shrink-0 select-none border-l border-gray-200 px-4 py-3.5 text-[12px] font-semibold text-gray-400">
                USDC
              </span>
            </div>
            {isConnected && isOnArc && usdcBalance !== undefined && (
              <p className="text-[11px] text-gray-400">
                Balance: <span className="text-gray-600">{formatUsdcFull(usdcBalance)} USDC</span>
                {amountValid && !hasEnoughBalance && (
                  <span className="ml-2 font-medium text-red-400">— insufficient</span>
                )}
              </p>
            )}
          </div>

          {/* Duration */}
          <div className="space-y-2.5">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
              Duration
            </label>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map(d => {
                const active = durationPreset === d.secs
                return (
                  <button
                    key={d.label}
                    type="button"
                    disabled={isWorking}
                    onClick={() => { setDurationPreset(d.secs); setCustomDays('') }}
                    className="rounded-lg border px-3.5 py-2 text-[12px] font-semibold transition-all disabled:opacity-60"
                    style={active
                      ? { background: '#00FF41', borderColor: '#00FF41', color: '#0a0a0a' }
                      : { background: 'transparent', borderColor: '#e5e7eb', color: '#6b7280' }
                    }
                  >
                    {d.label}
                  </button>
                )
              })}
            </div>
            {/* Custom days */}
            <div className="flex items-center gap-2">
              <div className={[
                'flex items-center rounded-lg border bg-gray-50/70 transition-all',
                'focus-within:border-gray-300 focus-within:bg-white focus-within:ring-1 focus-within:ring-gray-100',
                durationPreset === null && customDays
                  ? 'border-[#00FF41]'
                  : 'border-gray-200',
              ].join(' ')}>
                <input
                  type="number"
                  placeholder="Custom"
                  min="0.1"
                  step="0.1"
                  value={customDays}
                  disabled={isWorking}
                  onChange={e => { setCustomDays(e.target.value); setDurationPreset(null) }}
                  className="w-20 bg-transparent px-3 py-2 text-[12px] text-gray-700 placeholder:text-gray-300 focus:outline-none disabled:opacity-60"
                />
                <span className="pr-3 text-[11px] text-gray-400">days</span>
              </div>
              {durationPreset === null && customDays && parseFloat(customDays) > 0 && (
                <span className="text-[11px] text-gray-500">
                  ≈ {(parseFloat(customDays) * 24).toFixed(0)} hours
                </span>
              )}
            </div>
          </div>

          {/* ── CTA section ── */}
          <div className="space-y-3 pt-1">

            {/* Not connected → Connect Wallet */}
            {!isConnected && (
              <button
                onClick={() => openConnectModal?.()}
                className="flex w-full items-center justify-center gap-2 rounded-xl py-4 text-[14px] font-bold transition-all active:scale-[0.98]"
                style={{ background: '#00FF41', color: '#0a0a0a' }}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18-3a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3m18-3V6" />
                </svg>
                Connect Wallet
              </button>
            )}

            {/* Connected but wrong network */}
            {isConnected && !isOnArc && (
              <button
                onClick={() => switchChain({ chainId: ARC_CHAIN_ID })}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-gray-900 bg-gray-900 py-4 text-[14px] font-bold text-white transition-all hover:bg-gray-700 active:scale-[0.98]"
              >
                Switch to Arc Network
              </button>
            )}

            {/* Connected + on Arc → Deploy button */}
            {isConnected && isOnArc && (
              <>
                <button
                  onClick={handleDeploy}
                  disabled={!isFormValid || isWorking || !hasEnoughBalance}
                  className="flex w-full items-center justify-center gap-2.5 rounded-xl py-4 text-[14px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                  style={
                    !isWorking && isFormValid && hasEnoughBalance
                      ? { background: '#00FF41', color: '#0a0a0a' }
                      : { background: '#f3f4f6', color: '#9ca3af' }
                  }
                >
                  {isWorking ? <><Spinner /> {statusMsg}</> : 'Deploy Stream'}
                </button>

                {isWorking && (
                  <p className="text-center text-[11px] text-gray-400">
                    {step === 'funding'  ? 'Step 1 of 2 — funding the vault' : 'Step 2 of 2 — deploying vault contract'}
                  </p>
                )}

                {!hasEnoughBalance && amountValid && !isWorking && (
                  <p className="text-center text-[12px] font-medium text-red-400">
                    Insufficient USDC. Fund your wallet on Arc first.
                  </p>
                )}
              </>
            )}

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-center text-[12px] text-red-500">
                {error}
              </div>
            )}

            {!isWorking && isConnected && isOnArc && (
              <p className="text-center text-[11px] text-gray-300">
                2 wallet signatures required — fund vault, then deploy
              </p>
            )}
          </div>
        </div>

        <Footer />
      </div>
    </div>
  )
}

function Footer() {
  return (
    <div className="flex items-center justify-center gap-2 border-t border-gray-50 bg-gray-50/40 py-3.5">
      <StreamPayLogo />
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-300">
        Powered by StreamPay
      </span>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
