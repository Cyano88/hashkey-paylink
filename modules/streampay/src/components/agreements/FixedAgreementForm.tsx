import { useState, type FormEvent, type ReactNode } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeft, ArrowUpRight, Check, Copy, Loader2, LockKeyhole } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrivyConnectButton } from '../../../../../src/lib/PrivyConnectButton'

type CreatedAgreement = {
  agreement: { id: string; title: string; amount: string; recipient: string }
  payerReviewPath: string
}

const APP_ORIGIN = 'https://app.hashpaylink.com'

function newIdempotencyKey() {
  const suffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  return `hashpaystream:${suffix}`
}

export default function FixedAgreementForm() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [durationSeconds, setDurationSeconds] = useState('86400')
  const [cancellationWindowSeconds, setCancellationWindowSeconds] = useState('900')
  const [idempotencyKey] = useState(newIdempotencyKey)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [created, setCreated] = useState<CreatedAgreement | null>(null)
  const [copied, setCopied] = useState(false)

  const payerUrl = created?.payerReviewPath ? `${APP_ORIGIN}${created.payerReviewPath}` : ''

  async function submit(event: FormEvent) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again to create this agreement.')
      const response = await fetch('/api/hashpaystream/arc-agreements', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          title,
          description,
          amount,
          recipient,
          durationSeconds: Number(durationSeconds),
          cancellationWindowSeconds: Number(cancellationWindowSeconds),
        }),
      })
      const data = await response.json().catch(() => undefined) as (CreatedAgreement & { ok?: boolean; error?: string }) | undefined
      if (!response.ok || !data?.ok || !data.payerReviewPath) {
        throw new Error(data?.error || 'The agreement could not be created.')
      }
      setCreated(data)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The agreement could not be created.')
    } finally {
      setSubmitting(false)
    }
  }

  async function copyLink() {
    if (!payerUrl) return
    await navigator.clipboard.writeText(payerUrl)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }

  if (!ready) {
    return <div className="flex min-h-[58vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-gray-300" /></div>
  }

  if (!authenticated) {
    return (
      <section className="flex min-h-[64vh] w-full max-w-md flex-col items-center justify-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-950 text-white dark:bg-white dark:text-gray-950">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">Create an agreement.</h1>
        <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in with the identity that owns this Hash PayStream project.</p>
        <PrivyConnectButton
          debugLabel="hashpaystream-create-agreement"
          className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"
        >
          Continue with email
        </PrivyConnectButton>
      </section>
    )
  }

  if (created) {
    return (
      <section className="w-full max-w-xl py-8 sm:py-12">
        <div className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#18181b] sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white">
            <Check className="h-5 w-5" />
          </div>
          <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">Agreement ready</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-950 dark:text-white">Send the payer link.</h1>
          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {created.agreement.amount} USDC · {created.agreement.title}
          </p>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">Private payer link</p>
            <p className="mt-2 break-all text-xs leading-5 text-gray-600 dark:text-gray-300">{payerUrl}</p>
          </div>
          <p className="mt-3 text-xs leading-5 text-gray-400">Anyone with this link can review and fund this agreement.</p>

          <div className="mt-6 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void copyLink()}
              className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-4 py-3 text-sm font-semibold text-gray-900 dark:border-white/10 dark:text-white"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy link'}
            </button>
            <a
              href={payerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-sm font-semibold text-white dark:bg-white dark:text-gray-950"
            >
              Open checkout
              <ArrowUpRight className="h-4 w-4" />
            </a>
          </div>
          <Link to="/" className="mt-3 flex w-full items-center justify-center rounded-xl px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
            View agreements
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="w-full max-w-xl py-8 sm:py-12">
      <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-950 dark:text-gray-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" />
        Agreements
      </Link>
      <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">Fixed payment · Arc Testnet</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-gray-950 dark:text-white">New agreement</h1>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Protect one USDC payment and release it when the work is complete.</p>

      <form onSubmit={submit} className="mt-7 space-y-5 rounded-3xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-[#18181b] sm:p-7">
        <Field label="Agreement title">
          <input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={140} placeholder="Website design delivery" className={inputClass} />
        </Field>
        <Field label="What is being delivered?">
          <textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={10} maxLength={800} rows={3} placeholder="Describe the work or product covered by this payment." className={`${inputClass} resize-none`} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount">
            <div className="relative">
              <input value={amount} onChange={event => setAmount(event.target.value)} required inputMode="decimal" placeholder="0.10" className={`${inputClass} pr-16`} />
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-gray-400">USDC</span>
            </div>
          </Field>
          <Field label="Recipient Arc address">
            <input value={recipient} onChange={event => setRecipient(event.target.value.trim())} required placeholder="0x…" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Agreement duration">
            <select value={durationSeconds} onChange={event => setDurationSeconds(event.target.value)} className={inputClass}>
              <option value="7200">2 hours</option>
              <option value="86400">1 day</option>
              <option value="259200">3 days</option>
              <option value="604800">7 days</option>
            </select>
          </Field>
          <Field label="Payer cancellation window">
            <select value={cancellationWindowSeconds} onChange={event => setCancellationWindowSeconds(event.target.value)} className={inputClass}>
              <option value="0">No cancellation window</option>
              <option value="900">15 minutes</option>
              <option value="3600">1 hour</option>
            </select>
          </Field>
        </div>

        {error && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-gray-950"
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          Create payer link
        </button>
      </form>
    </section>
  )
}

const inputClass = 'w-full rounded-xl border border-gray-200 bg-white px-3.5 py-3 text-sm text-gray-950 outline-none transition-colors placeholder:text-gray-300 focus:border-gray-500 dark:border-white/10 dark:bg-[#111113] dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white/30'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-medium text-gray-600 dark:text-gray-300">{label}</span>
      {children}
    </label>
  )
}
