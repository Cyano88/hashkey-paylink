import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  canUseCircleEvmEmailWallet,
  connectCircleEvmEmailWallet,
  deployCircleEvmEmailWallet,
  type CircleEvmEmailSession,
} from '../../../../src/lib/circleEvmEmailWallet'

function cleanEmail(value: string | null) {
  return (value ?? '').trim().toLowerCase()
}

function isPlaceholderEmail(value: string) {
  return /@(example|test|invalid)\.(com|net|org)$/i.test(value)
}

function setupError(err: unknown) {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === 'string' && err) return err
  return 'Circle could not start wallet setup. Use a real email inbox and request a fresh code.'
}

export function RecipientWalletSetup() {
  const [params] = useSearchParams()
  const [email, setEmail] = useState(cleanEmail(params.get('email')))
  const pendingId = (params.get('pending') ?? '').trim()
  const [session, setSession] = useState<CircleEvmEmailSession | null>(null)
  const [copied, setCopied] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const configured = canUseCircleEvmEmailWallet('arc')

  async function prepareWallet() {
    if (!configured || !email) return
    if (isPlaceholderEmail(email)) {
      setError('Wrong email address. Enter the recipient email that should receive the Circle OTP.')
      setStatus('')
      return
    }
    setWorking(true)
    setStatus('Opening Circle Smart Wallet...')
    setError(null)
    try {
      const next = await connectCircleEvmEmailWallet(email, 'arc')
      setSession(next)
      setStatus('Activating Circle wallet on Arc...')
      await deployCircleEvmEmailWallet({ session: next })
      setStatus('Registering wallet for Telegram HashpayStream...')
      const res = await fetch('/api/circle-recipient-wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, walletAddress: next.wallet.address }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? 'Could not register Circle wallet.')
      setStatus(
        pendingId
          ? 'Circle wallet ready. Ask the sender to check readiness and deploy the stream.'
          : 'Circle wallet ready for HashpayStream.',
      )
    } catch (err) {
      setError(setupError(err))
      setStatus('')
    } finally {
      setWorking(false)
    }
  }

  async function copyWallet() {
    if (!session?.wallet.address) return
    await navigator.clipboard.writeText(session.wallet.address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className="w-full max-w-[480px] mx-auto mt-12">
      <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#15151a] shadow-sm">
        <div className="px-5 py-5 space-y-4 sm:px-7 sm:py-6">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Telegram HashpayStream</p>
            <h1 className="mt-1 text-[22px] font-bold tracking-tight text-gray-900 dark:text-white">Prepare Circle Wallet</h1>
          </div>

          <div className="rounded-2xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/40 dark:bg-blue-950/20 p-3.5 space-y-3">
            <input
              type="email"
              placeholder="recipient@email.com"
              value={email}
              onChange={event => setEmail(event.target.value)}
              disabled={working || !!session}
              className="w-full rounded-xl border-2 border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-4 py-3 text-[13px] text-gray-800 dark:text-gray-100 placeholder:text-gray-300 dark:placeholder:text-gray-600 focus:outline-none focus:border-blue-300 transition-colors disabled:opacity-50 min-h-[46px]"
            />

            {session && (
              <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-white dark:bg-[#15151a] px-3 py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">Circle Arc wallet</p>
                    <p className="truncate font-mono text-[11px] text-gray-600 dark:text-gray-300">{session.wallet.address}</p>
                  </div>
                  <button
                    type="button"
                    onClick={copyWallet}
                    className="shrink-0 rounded-lg border border-gray-200 dark:border-white/10 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 dark:text-gray-300"
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={prepareWallet}
              disabled={!configured || !email || working || !!session}
              className="flex w-full items-center justify-center rounded-xl py-3.5 text-[14px] font-bold transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
              style={{ background: '#111827', color: '#ffffff' }}
            >
              {working ? status || 'Preparing...' : session ? 'Wallet Ready' : 'Prepare with Circle Smart Wallet'}
            </button>

            {status && !working && <p className="text-center text-[12px] font-semibold text-emerald-600">{status}</p>}
            {error && <p className="text-center text-[12px] font-semibold text-red-500">{error}</p>}
            {!configured && <p className="text-center text-[12px] font-semibold text-red-500">Circle Smart Wallet is not configured.</p>}
            <div className="flex justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#15151a] px-3 py-1">
                <img src="/brand/circle-logo.jpeg" alt="" className="h-3 w-3 rounded-full object-cover" />
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500">Powered by Circle</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
