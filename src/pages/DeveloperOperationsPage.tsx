import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CirclePause,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react'
import { PrivyConnectButton } from '../lib/PrivyConnectButton'
import PocketSelect from '../pocket/components/PocketSelect'
import { cn } from '../lib/utils'

type Network = 'base' | 'arbitrum' | 'arc'
type Operation = {
  id: string
  action: 'activated' | 'suspended' | 'reactivated'
  actor: string
  reason?: string
  createdAt: string
}
type Project = {
  id: string
  name: string
  ownerEmail: string
  website: string
  useCase: string
  checkoutMode: 'human' | 'agentic'
  capabilities: Array<'hosted_checkout' | 'polymarket_funding'>
  settlementMode: 'usdc' | 'ngn'
  settlementStatus: 'ready' | 'review_required'
  operationalStatus: 'active' | 'suspended'
  suspendedAt?: string
  suspendedBy?: string
  suspensionReason?: string
  networks: Network[]
  defaultNetwork: Network
  recipients: Partial<Record<Network, string>>
  refundAddress: string
  allowedOrigins: string[]
  webhookUrl: string
  webhookConfigured: boolean
  bankName: string
  bankAccountName: string
  bankAccountLast4: string
  bankVerifiedAt?: string
  keys: Array<{ id: string; name: string; prefix: string; environment?: 'test' | 'live'; revokedAt?: string }>
  operations?: Operation[]
  createdAt: string
  updatedAt: string
}
type Summary = { total: number; active: number; setupRequired: number; suspended: number }
type Filter = 'all' | 'active' | 'setup' | 'suspended'

const EMPTY_SUMMARY: Summary = { total: 0, active: 0, setupRequired: 0, suspended: 0 }

function projectState(project: Project) {
  if (project.operationalStatus === 'suspended') return 'Suspended'
  if (project.settlementStatus !== 'ready') return 'Setup required'
  return 'Active'
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value
}

function formatDate(value?: string) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'Not available'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export default function DeveloperOperationsPage() {
  const { ready, authenticated, getAccessToken, logout } = usePrivy()
  const [projects, setProjects] = useState<Project[]>([])
  const [summary, setSummary] = useState<Summary>(EMPTY_SUMMARY)
  const [activeId, setActiveId] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [suspensionReason, setSuspensionReason] = useState('')

  async function api(method: string, body?: Record<string, unknown>) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch(method === 'GET' ? '/api/developer-projects?resource=admin' : '/api/developer-projects', {
      method,
      cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => undefined) as {
      ok?: boolean
      projects?: Project[]
      project?: Project
      summary?: Summary
      error?: string
    } | undefined
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Developer operations request failed.')
    return data
  }

  async function loadProjects() {
    setLoading(true)
    setError('')
    try {
      const data = await api('GET')
      const next = data.projects ?? []
      setProjects(next)
      setSummary(data.summary ?? EMPTY_SUMMARY)
      setActiveId(current => current && next.some(project => project.id === current) ? current : next[0]?.id ?? '')
    } catch (reason) {
      setProjects([])
      setSummary(EMPTY_SUMMARY)
      setError(reason instanceof Error ? reason.message : 'Developer operations could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) {
      setProjects([])
      return
    }
    void loadProjects()
  }, [ready, authenticated]) // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => projects.filter(project => {
    if (filter === 'active') return projectState(project) === 'Active'
    if (filter === 'setup') return projectState(project) === 'Setup required'
    if (filter === 'suspended') return projectState(project) === 'Suspended'
    return true
  }), [filter, projects])
  const active = filtered.find(project => project.id === activeId) ?? filtered[0]

  useEffect(() => {
    if (active && !filtered.some(project => project.id === active.id)) setActiveId(filtered[0]?.id ?? '')
  }, [active, filtered])
  useEffect(() => {
    setSuspensionReason('')
    setNotice('')
  }, [active?.id])

  async function operate(action: 'admin-activate' | 'admin-suspend' | 'admin-reactivate') {
    if (!active) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const data = await api('POST', {
        action,
        projectId: active.id,
        ...(action === 'admin-suspend' ? { reason: suspensionReason } : {}),
      })
      if (!data.project) throw new Error('The project operation returned no project.')
      setProjects(current => current.map(project => project.id === data.project!.id ? data.project! : project))
      setSuspensionReason('')
      setNotice(action === 'admin-suspend' ? 'Project suspended. Its API keys can no longer create checkouts.' : 'Project active.')
      await loadProjects()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The project operation failed.')
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <OperationsLoading />
  if (!authenticated) return <OperationsSignIn />

  return (
    <main className="mx-auto min-h-[calc(100dvh-7rem)] max-w-6xl px-4 py-8 sm:py-10">
      <OperationsTop onLogout={logout} />
      <div className="mt-7 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Projects" value={summary.total} />
        <SummaryCard label="Active" value={summary.active} tone="success" />
        <SummaryCard label="Setup required" value={summary.setupRequired} tone="warning" />
        <SummaryCard label="Suspended" value={summary.suspended} tone="danger" />
      </div>

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="rounded-[1.5rem] border border-gray-200 bg-white p-3 shadow-card dark:border-white/10 dark:bg-[#111216] lg:sticky lg:top-24 lg:w-64">
          <PocketSelect
            value={active?.id ?? ''}
            options={filtered.map(project => ({ value: project.id, label: `${project.name} · ${project.checkoutMode === 'agentic' ? 'Agentic' : 'Human'}` }))}
            onChange={setActiveId}
            ariaLabel="Developer project"
            placeholder={filtered.length ? 'Select project' : 'No matching projects'}
            buttonClassName="shadow-none"
          />
          <div className="mt-3 grid grid-cols-2 gap-1 lg:grid-cols-1">
            {([
              ['all', 'All projects'],
              ['active', 'Active'],
              ['setup', 'Setup required'],
              ['suspended', 'Suspended'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={cn(
                  'rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition',
                  filter === value
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200'
                    : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void loadProjects()}
            disabled={loading}
            className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.05]"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> Refresh
          </button>
        </aside>

        <section className="min-w-0 flex-1 rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-7">
          {loading && !projects.length
            ? <InlineLoading />
            : active
              ? <ProjectOperations
                  project={active}
                  busy={busy}
                  reason={suspensionReason}
                  setReason={setSuspensionReason}
                  onOperate={operate}
                />
              : !error && <EmptyProjects />}
          {error && <Message tone="error">{error}</Message>}
          {notice && <Message tone="success">{notice}</Message>}
        </section>
      </div>
    </main>
  )
}

function ProjectOperations({ project, busy, reason, setReason, onOperate }: {
  project: Project
  busy: boolean
  reason: string
  setReason: (value: string) => void
  onOperate: (action: 'admin-activate' | 'admin-suspend' | 'admin-reactivate') => Promise<void>
}) {
  const state = projectState(project)
  const activeKeys = project.keys.filter(key => !key.revokedAt)
  return <div>
    <PanelHeader
      eyebrow="Developer operations"
      title={project.name}
      copy="Inspect trusted routing and control project availability without changing developer-owned configuration."
      status={state}
    />

    <div className="mt-7 grid gap-3 sm:grid-cols-2">
      <Detail label="Owner" value={project.ownerEmail || 'Email unavailable'} />
      <Detail label="Payment path" value={project.checkoutMode === 'agentic' ? 'Agentic x402' : 'Human checkout'} />
      <Detail label="Settlement" value={project.settlementMode === 'ngn' ? 'Naira via Paycrest' : 'Receive USDC'} />
      <Detail label="Credentials" value={`${activeKeys.length} active key${activeKeys.length === 1 ? '' : 's'}`} />
      <Detail label="Created" value={formatDate(project.createdAt)} />
      <Detail label="Last changed" value={formatDate(project.updatedAt)} />
    </div>

    <section className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <p className="text-xs font-semibold text-gray-950 dark:text-white">Product declaration</p>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{project.useCase}</p>
      <a href={project.website} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-300">
        {project.website} <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </section>

    <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-950 dark:text-white">Trusted routing</p>
          <p className="mt-1 text-[11px] leading-5 text-gray-500 dark:text-gray-400">Read-only. Developers control these destinations.</p>
        </div>
        <Lock className="h-4 w-4 text-gray-400" />
      </div>
      <div className="mt-4 space-y-2">
        {project.settlementMode === 'usdc'
          ? project.networks.map(network => <RouteRow key={network} label={network === 'arc' ? 'Arc Testnet' : network[0].toUpperCase() + network.slice(1)} value={project.recipients[network] ?? 'Missing'} />)
          : <>
            <RouteRow label="Verified bank" value={`${project.bankName || 'Missing'} · ${project.bankAccountName || 'Account unavailable'} · ••••${project.bankAccountLast4 || '----'}`} />
            <RouteRow label="Base refund" value={project.refundAddress || 'Missing'} />
          </>}
        <RouteRow label="Return origin" value={project.allowedOrigins.join(', ') || 'Missing'} />
        <RouteRow label="Webhook" value={project.webhookConfigured ? project.webhookUrl || 'Configured' : 'Not configured'} />
      </div>
    </section>

    <OperationsControl project={project} busy={busy} reason={reason} setReason={setReason} onOperate={onOperate} />

    <section className="mt-4">
      <p className="text-xs font-semibold text-gray-950 dark:text-white">Operations history</p>
      <div className="mt-3 space-y-2">
        {project.operations?.length
          ? [...project.operations].reverse().map(operation => (
            <div key={operation.id} className="rounded-xl border border-gray-200 px-3 py-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold capitalize text-gray-800 dark:text-gray-200">{operation.action}</p>
                <p className="text-[10px] text-gray-400">{formatDate(operation.createdAt)}</p>
              </div>
              <p className="mt-1 text-[10px] text-gray-500 dark:text-gray-400">{operation.actor}</p>
              {operation.reason && <p className="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">{operation.reason}</p>}
            </div>
          ))
          : <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-8 text-center text-xs text-gray-400 dark:border-white/10">No operator actions recorded.</div>}
      </div>
    </section>
  </div>
}

function OperationsControl({ project, busy, reason, setReason, onOperate }: {
  project: Project
  busy: boolean
  reason: string
  setReason: (value: string) => void
  onOperate: (action: 'admin-activate' | 'admin-suspend' | 'admin-reactivate') => Promise<void>
}) {
  if (project.operationalStatus === 'suspended') {
    return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Project suspended</p>
      <p className="mt-2 text-[11px] leading-5 text-amber-800/75 dark:text-amber-200/70">{project.suspensionReason}</p>
      <p className="mt-1 text-[10px] text-amber-700/60 dark:text-amber-200/50">{formatDate(project.suspendedAt)} · {project.suspendedBy}</p>
      <button type="button" disabled={busy} onClick={() => void onOperate('admin-reactivate')} className="mt-4 flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Reactivate project
      </button>
    </section>
  }

  if (project.settlementStatus !== 'ready') {
    return <section className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
      <p className="text-xs font-semibold text-amber-900 dark:text-amber-100">Setup requires attention</p>
      <p className="mt-2 text-[11px] leading-5 text-amber-800/75 dark:text-amber-200/70">Activation succeeds only when saved settlement routing is complete. This does not bypass bank or address validation.</p>
      <button type="button" disabled={busy} onClick={() => void onOperate('admin-activate')} className="mt-4 flex h-10 items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-gray-950">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Validate and activate
      </button>
    </section>
  }

  return <section className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <p className="flex items-center gap-2 text-xs font-semibold text-gray-950 dark:text-white"><CirclePause className="h-4 w-4 text-gray-400" /> Suspend project</p>
    <p className="mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400">Immediately disables API-key checkout creation. It does not delete projects, keys, routing, or history.</p>
    <textarea
      value={reason}
      onChange={event => setReason(event.target.value)}
      placeholder="Required operational reason"
      className="mt-4 h-24 w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-950 outline-none transition focus:border-red-300 focus:bg-white focus:ring-4 focus:ring-red-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
    />
    <button type="button" disabled={busy || reason.trim().length < 8} onClick={() => void onOperate('admin-suspend')} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-full border border-red-200 px-5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-40 dark:border-red-400/20 dark:text-red-300 dark:hover:bg-red-400/10">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />} Suspend access
    </button>
  </section>
}

function OperationsSignIn() {
  return <main className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-6xl items-center px-4 py-12">
    <section className="grid w-full overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,.12)] dark:border-white/10 dark:bg-[#101114] lg:grid-cols-[1.05fr_.95fr]">
      <div className="bg-[#050609] p-7 text-white sm:p-10 lg:p-12">
        <Link to="/" className="text-sm font-semibold text-white/60 transition hover:text-white">Hash PayLink</Link>
        <p className="mt-16 text-[10px] font-bold uppercase tracking-[0.24em] text-blue-300">Developer operations</p>
        <h1 className="mt-4 max-w-lg text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">Control exceptions without touching developer funds.</h1>
        <p className="mt-5 max-w-lg text-sm leading-6 text-white/55">Inspect trusted routing, resolve legacy activation, and suspend compromised integrations with a permanent operator record.</p>
      </div>
      <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><ShieldCheck className="h-5 w-5" /></span>
        <h2 className="mt-5 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Restricted operations</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in with an allowlisted Privy identity. Receiving wallets and API secrets remain outside operator control.</p>
        <PrivyConnectButton logoutOnAuthenticated={false} debugLabel="developer-operations" className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-semibold text-white transition hover:bg-gray-800 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-200">
          Sign in to operations <ChevronRight className="h-4 w-4" />
        </PrivyConnectButton>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-gray-400"><Lock className="h-3 w-3" /> Privy identity and server allowlist required.</p>
      </div>
    </section>
  </main>
}

function OperationsTop({ onLogout }: { onLogout: () => Promise<void> }) {
  return <header className="flex items-center justify-between">
    <Link to="/" className="text-sm font-bold text-gray-950 dark:text-white">Hash PayLink <span className="font-medium text-gray-400">Operations</span></Link>
    <div className="flex items-center gap-2">
      <Link to="/developers" className="hidden h-9 items-center rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-500 sm:flex dark:border-white/10 dark:text-gray-300">Developer portal</Link>
      <button type="button" onClick={() => void onLogout()} className="flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-500 dark:border-white/10 dark:text-gray-300"><LogOut className="h-3.5 w-3.5" /> Sign out</button>
    </div>
  </header>
}

function SummaryCard({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'text-gray-950 dark:text-white',
    success: 'text-emerald-600 dark:text-emerald-300',
    warning: 'text-amber-600 dark:text-amber-300',
    danger: 'text-red-600 dark:text-red-300',
  }
  return <div className="rounded-2xl border border-gray-200 bg-white px-4 py-4 shadow-card dark:border-white/10 dark:bg-[#111216]">
    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-gray-400">{label}</p>
    <p className={cn('mt-2 text-2xl font-semibold tracking-[-0.04em]', tones[tone])}>{value}</p>
  </div>
}

function PanelHeader({ eyebrow, title, copy, status }: { eyebrow: string; title: string; copy: string; status: string }) {
  const tone = status === 'Active'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300'
    : status === 'Suspended'
      ? 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300'
      : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300'
  return <div className="flex items-start justify-between gap-4">
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">{eyebrow}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">{title}</h1>
      <p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{copy}</p>
    </div>
    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide', tone)}>{status}</span>
  </div>
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-xs font-semibold text-gray-800 dark:text-gray-200">{value}</p></div>
}

function RouteRow({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-center justify-between gap-4 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-white/[0.04]"><span className="shrink-0 text-[10px] font-semibold text-gray-500 dark:text-gray-400">{label}</span><code title={value} className="min-w-0 truncate text-right text-[10px] text-gray-700 dark:text-gray-300">{value.startsWith('0x') ? shortAddress(value) : value}</code></div>
}

function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  return <p className={cn('mt-5 rounded-xl border px-3 py-2 text-xs font-medium', tone === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200')}>{children}</p>
}

function OperationsLoading() {
  return <main className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-xl items-center px-4 py-12"><section className="w-full rounded-[1.75rem] border border-gray-200 bg-white p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,.08)] dark:border-white/10 dark:bg-[#111216]"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><Loader2 className="h-5 w-5 animate-spin" /></span><h1 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-gray-950 dark:text-white">Securing operations</h1><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">Checking Privy identity and the server-side operations allowlist.</p></section></main>
}

function InlineLoading() {
  return <div className="flex min-h-72 flex-col items-center justify-center text-gray-400"><Loader2 className="h-5 w-5 animate-spin" /><p className="mt-3 text-xs">Loading developer projects…</p></div>
}

function EmptyProjects() {
  return <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 text-center dark:border-white/10"><KeyRound className="h-5 w-5 text-gray-400" /><p className="mt-3 text-sm font-semibold text-gray-700 dark:text-gray-200">No matching projects</p><p className="mt-1 text-xs text-gray-400">Change the filter or refresh operations.</p></div>
}
