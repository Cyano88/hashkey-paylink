import ProductPicker from '../developer/ProductPicker'
import {needsSettlementRouting, type ProductCapability} from '../lib/developerProducts'
import { isAgentCheckoutNetwork, developerProductNetworks } from '../lib/developerNetworkPolicy'
import PaymentActivityPanel from '../developer/PaymentActivityPanel'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CliGuide, OverviewPanel, ProductsPanel, SandboxPanel, portalSections, type PortalSection } from '../developer/PortalPanels'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeft, Bot, Check, ChevronRight, Copy, KeyRound, Loader2, Lock, LogOut, Plus, RotateCw, ShieldCheck, UserRound, Webhook } from 'lucide-react'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import PocketSelect from '../pocket/components/PocketSelect'
import { cn, copyToClipboard } from '../lib/utils'

type Network = 'base' | 'arbitrum' | 'arc'
type Capability = ProductCapability
type CheckoutMode = 'human' | 'agentic'
type CreateProjectForm = { name: string; website: string; useCase: string; checkoutMode: CheckoutMode | ''; capabilities: Capability[] }
type Project = {
  id: string
  name: string
  ownerEmail: string
  website: string
  brandImageUrl: string
  useCase: string
  checkoutMode: CheckoutMode
  capabilities: Capability[]
  settlementMode: 'usdc' | 'ngn'
  settlementStatus: 'ready' | 'review_required'
  operationalStatus?: 'active' | 'suspended'
  suspensionReason?: string
  arcAgreementPilot?: { status: 'draft_only' | 'approved' | 'disabled'; maxAgreementUsdc: string; dailyVolumeUsdc: string; maxActiveAgreements: number; maxDurationSeconds: number; updatedAt: string }
  networks: Network[]
  defaultNetwork: Network
  recipients: Partial<Record<Network, string>>
  refundAddress: string
  allowedOrigins: string[]
  webhookUrl: string
  webhookConfigured: boolean
  bankCode: string
  bankName: string
  bankAccountName: string
  bankAccountLast4: string
  bankAccountNumber?: string
  bankVerifiedAt?: string
  keys: Array<{ id: string; name: string; prefix: string; environment?: 'test' | 'live'; createdAt: string; revokedAt?: string; expiresAt?: string; scopes?: string[] }>
  webhookDeliveries?: Array<{ id: string; event: string; status: 'delivered' | 'failed'; responseStatus?: number; attemptedAt: string; error?: string }>
  updatedAt: string
}
type Institution = { code: string; name: string; type?: string }

const NETWORKS: Array<{ key: Network | 'solana'; label: string; note?: string; disabled?: boolean }> = [
  { key: 'base', label: 'Base' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'arc', label: 'Arc', note: 'Mainnet' },
  { key: 'solana', label: 'Solana', note: 'Soon', disabled: true },
]

function fieldClass() {
  return 'h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-blue-400/50 dark:focus:bg-white/[0.07]'
}

export default function DeveloperPortalPage() {
  const { ready, authenticated, getAccessToken, logout, user } = usePrivy()
  const loadGeneration = useRef(0)
  const [projects, setProjects] = useState<Project[]>([])
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [params, setParams] = useSearchParams()
  const [activeId, setActiveId] = useState(params.get('project') ?? '')
  const [loadFailed, setLoadFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selectedTab = params.get('section')
  const tab: PortalSection = portalSections.some(([value]) => value === selectedTab) ? selectedTab as PortalSection : 'overview'
  const sandbox = params.get('environment') === 'test'
  function setTab(value: PortalSection) {
    if (busy) return
    if (draft && active && JSON.stringify(draft) !== JSON.stringify(active)) {
      if (!window.confirm('Discard unsaved project changes?')) return
      setDraft({ ...active, recipients: {...active.recipients}, networks: [...active.networks], allowedOrigins: [...active.allowedOrigins] })
    }
    setParams(current => { const next = new URLSearchParams(current); next.set('section', value); return next }) }
  function selectProject(value: string) {
    if (busy) return
    if (draft && active && JSON.stringify(draft) !== JSON.stringify(active) && !window.confirm('Discard unsaved project changes?')) return
    setNewKey(null); setNewWebhookSecret(null); setActiveId(value); setCreatingNew(false)
    setParams(current => { const next = new URLSearchParams(current); next.set('project', value); return next })
  }
  const [creatingNew, setCreatingNew] = useState(false)
  const [newKey, setNewKey] = useState<{ value: string; environment: 'test' | 'live'; projectId: string } | null>(null)
  const [newWebhookSecret, setNewWebhookSecret] = useState<{ value: string; projectId: string } | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [keyNames, setKeyNames] = useState({ test: 'Sandbox backend', live: 'Production backend' })
  const [createForm, setCreateForm] = useState<CreateProjectForm>({ name: '', website: '', useCase: '', checkoutMode: '', capabilities: ['hosted_checkout'] })
  const [institutions, setInstitutions] = useState<Institution[]>([])
  const [institutionsLoading, setInstitutionsLoading] = useState(false)
  const active = projects.find(project => project.id === activeId) ?? projects[0]
  const [draft, setDraft] = useState<Project | null>(null)

  useEffect(() => {
    if (ready) { setAuthWaitExpired(false); return }
    const timer = window.setTimeout(() => setAuthWaitExpired(true), 8_000)
    return () => window.clearTimeout(timer)
  }, [ready])

  async function api(method: string, body?: Record<string, unknown>) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/developer-projects', {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => undefined) as { ok?: boolean; projects?: Project[]; project?: Project; apiKey?: string; webhookSecret?: string; error?: string } | undefined
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Developer dashboard request failed.')
    return data
  }

  async function loadProjects() {
    const generation = ++loadGeneration.current
    setLoading(true); setLoadFailed(false); setError('')
    try {
      const data = await api('GET')
      if (generation !== loadGeneration.current) return
      const next = data.projects ?? []
      setProjects(next)
      setActiveId(current => current && next.some(project => project.id === current) ? current : next[0]?.id ?? '')
    } catch (reason) {
      if (generation !== loadGeneration.current) return
      setLoadFailed(true); setError(reason instanceof Error ? reason.message : 'Developer projects could not be loaded.')
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) { setProjects([]); setDraft(null); setNewKey(null); setNewWebhookSecret(null); return }
    void loadProjects()
    return () => { loadGeneration.current += 1 }
  }, [ready, authenticated, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setDraft(active ? { ...active, recipients: { ...active.recipients }, networks: [...active.networks], allowedOrigins: [...active.allowedOrigins] } : null) }, [active?.id, active?.updatedAt])
  useEffect(() => { setWebhookUrl(active?.webhookUrl ?? '') }, [active?.id, active?.webhookUrl])
  useEffect(() => { const project = params.get('project'); if (project) { setNewKey(null); setNewWebhookSecret(null); setActiveId(project) } }, [params.get('project')])
  useEffect(() => { setNewKey(null); setNewWebhookSecret(null); setError(''); setNotice('') }, [activeId])
  useEffect(() => {
    if (!authenticated || draft?.settlementMode !== 'ngn' || institutions.length || institutionsLoading) return
    let cancelled = false
    setInstitutionsLoading(true)
    void getAccessToken().then(async token => {
      if (!token) throw new Error('Sign in again to load banks.')
      const response = await fetch('/api/developer-projects?resource=institutions', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json().catch(() => undefined) as { ok?: boolean; institutions?: Institution[]; error?: string } | undefined
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Banks could not be loaded.')
      if (!cancelled) setInstitutions(data.institutions ?? [])
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Banks could not be loaded.') })
      .finally(() => { if (!cancelled) setInstitutionsLoading(false) })
    return () => { cancelled = true }
  }, [authenticated, draft?.settlementMode, getAccessToken, institutions.length])

  async function createProject() {
    const generation = loadGeneration.current
    setBusy(true); setError('')
    try {
      const data = await api('POST', { action: 'create', ...createForm })
      if (generation !== loadGeneration.current) return
      if (!data.project) throw new Error('Project creation returned no project.')
      setProjects(current => [...current, data.project!])
      setActiveId(data.project.id)
      setParams(current => { const next = new URLSearchParams(current); next.set('project', data.project!.id); next.set('section','overview'); return next })
      setCreatingNew(false)
      setCreateForm({ name: '', website: '', useCase: '', checkoutMode: '', capabilities: ['hosted_checkout'] })
      setNotice('Project created. Complete your settings to continue.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Project could not be created.') }
    finally { setBusy(false) }
  }

  async function saveProject(value = draft) {
    if (!value) return
    const draft = value
    const generation = loadGeneration.current
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await api('PUT', {
        action: 'configure', projectId: draft.id, name: draft.name, website: draft.website, brandImageUrl: draft.brandImageUrl, useCase: draft.useCase,
        checkoutMode: draft.checkoutMode, capabilities: draft.capabilities,
        settlementMode: draft.settlementMode, networks: draft.networks, defaultNetwork: draft.defaultNetwork,
        arcMainnetChainId: draft.networks.includes('arc') ? 5042 : undefined, recipients: draft.recipients, refundAddress: draft.refundAddress, allowedOrigins: draft.allowedOrigins,
        webhookUrl: draft.webhookUrl, bankCode: draft.bankCode, bankName: draft.bankName,
        bankAccountName: draft.bankAccountName, bankAccountNumber: draft.bankAccountNumber ?? '',
      })
      if (generation !== loadGeneration.current) return
      if (!data.project) throw new Error('Project update returned no project.')
      setProjects(current => current.map(project => project.id === data.project!.id ? data.project! : project))
      setNotice(data.project.operationalStatus === 'suspended'
        ? 'Configuration saved. The project remains suspended.'
        : data.project.settlementStatus === 'ready' ? 'Project settings saved.' : 'Configuration saved. Setup is still required.')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Configuration could not be saved.') }
    finally { setBusy(false) }
  }

  async function createKey(environment: 'test' | 'live') {
    if (!active) return
    const generation = loadGeneration.current
    setBusy(true); setError(''); setNewKey(null)
    try {
      const data = await api('POST', { action: 'create-key', projectId: active.id, name: keyNames[environment], environment })
      if (generation !== loadGeneration.current) return
      setNewKey(data.apiKey ? { value: data.apiKey, environment, projectId: active.id } : null)
      await loadProjects()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'API key could not be created.') }
    finally { setBusy(false) }
  }

  async function revokeKey(keyId: string) {
    if (!active) return
    const generation = loadGeneration.current
    setBusy(true); setError('')
    try { await api('POST', { action: 'revoke-key', projectId: active.id, keyId }); if (generation !== loadGeneration.current) return; await loadProjects() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'API key could not be revoked.') }
    finally { setBusy(false) }
  }

  async function rotateWebhookSecret() {
    if (!active) return
    const generation = loadGeneration.current
    setBusy(true); setError(''); setNewWebhookSecret(null)
    try {
      const data = await api('POST', { action: 'rotate-webhook-secret', projectId: active.id })
      if (generation !== loadGeneration.current) return
      setNewWebhookSecret(data.webhookSecret ? { value: data.webhookSecret, projectId: active.id } : null)
      await loadProjects()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Webhook secret could not be created.') }
    finally { setBusy(false) }
  }

  if (!ready) return <PortalLoading delayed={authWaitExpired} />

  if (!authenticated) {
    return (
      <main className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-6xl items-center px-4 py-12">
        <section className="grid w-full overflow-hidden rounded-[2rem] border border-gray-200 bg-white shadow-[0_32px_100px_rgba(15,23,42,.12)] dark:border-white/10 dark:bg-[#101114] lg:grid-cols-[1.05fr_.95fr]">
          <div className="bg-[#050609] p-7 text-white sm:p-10 lg:p-12">
            <Link to="/" className="text-sm font-semibold text-white/60 transition hover:text-white">Hash PayLink</Link>
            <p className="mt-16 text-xs font-bold uppercase tracking-[0.24em] text-blue-300">Developer platform</p>
            <h1 className="mt-4 max-w-lg text-4xl font-semibold leading-[1.2] tracking-normal sm:text-5xl">One API for payments your users understand.</h1>
            <p className="mt-5 max-w-lg text-sm leading-6 text-white/55">Configure settlement once. Create secure hosted checkouts from your backend and verify every payment before fulfillment.</p>
          </div>
          <div className="flex flex-col justify-center p-7 sm:p-10 lg:p-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><KeyRound className="h-5 w-5" /></span>
            <h2 className="mt-5 text-2xl font-semibold leading-[1.3] tracking-normal text-gray-950 dark:text-white">Build with Hash PayLink</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Sign in to configure your products, connect your backend and track project events.</p>
            <div className="mt-7"><PocketEmailLogin context="developer" /></div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400"><Lock className="h-3 w-3" /> Keep API keys on your backend.</p>
          </div>
        </section>
      </main>
    )
  }

  if (loading && !projects.length) return <PortalLoading />

  if (loadFailed && !projects.length) return <main className="mx-auto max-w-xl px-4 py-16"><h1 className="text-2xl font-semibold">Projects could not be loaded</h1><Message tone="error">{error}</Message><button type="button" disabled={loading} onClick={() => void loadProjects()} className="developer-primary mt-6">Try again</button></main>

  if (!projects.length) {
    return (
      <main className="mx-auto min-h-[calc(100dvh-7rem)] max-w-2xl px-4 py-12">
        <PortalTop onLogout={logout} />
        <Link to="/cli/authorize" className="mt-3 inline-block text-xs text-blue-600">Manage CLI access</Link>
        <CreateProjectCard form={createForm} setForm={setCreateForm} busy={busy} error={error} onCreate={createProject} emptyAccount />
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-[calc(100dvh-7rem)] max-w-6xl px-4 py-8 sm:py-10">
      <PortalTop onLogout={logout} />
      <Link to="/cli/authorize" className="mt-3 inline-block text-xs text-blue-600">Manage CLI access</Link>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500">{sandbox ? 'Sandbox preview - test payments are not enabled' : 'Live project configuration'}</p>
        <div role="group" aria-label="Environment" className="flex rounded-full border border-gray-200 p-1 dark:border-white/10">{(['live','test'] as const).map(environment => <button key={environment} type="button" aria-pressed={sandbox === (environment === 'test')} disabled={busy} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('environment',environment); return next })} className={cn('min-h-10 rounded-full px-4 text-sm font-semibold', sandbox === (environment === 'test') ? 'bg-gray-950 text-white dark:bg-white dark:text-gray-950' : 'text-gray-500')}>{environment === 'live' ? 'Live' : 'Sandbox'}</button>)}</div>
      </div>
      <div className="mt-7 flex flex-col gap-5 lg:flex-row lg:items-start">
        <aside className="rounded-[1.5rem] border border-gray-200 bg-white p-3 shadow-card dark:border-white/10 dark:bg-[#111216] lg:sticky lg:top-24 lg:w-64">
          <PocketSelect value={active?.id ?? ''} options={projects.map(project => ({ value: project.id, label: `${project.name} · ${project.checkoutMode === 'agentic' ? 'Agentic' : 'Human'}` }))} onChange={selectProject} disabled={busy} ariaLabel="Developer project" buttonClassName="shadow-none" />
          {active && <ProjectIdCard value={active.id} />}
          <button type="button" disabled={busy || sandbox} onClick={() => { setCreatingNew(true); setError(''); setNotice('') }} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/[0.05]"><Plus className="h-3.5 w-3.5" /> New project</button>
          <nav aria-label="Project navigation" className="mt-3 grid grid-cols-2 gap-1 lg:grid-cols-1">
            {portalSections.map(([value, label]) => (
              <button key={value} type="button" aria-current={tab === value && !creatingNew ? 'page' : undefined} disabled={busy} onClick={() => { setTab(value); setCreatingNew(false) }} className={cn('rounded-xl px-3 py-2.5 text-left text-xs font-semibold transition', tab === value ? 'bg-blue-50 text-blue-700 dark:bg-blue-400/15 dark:text-blue-200' : 'text-gray-500 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-white/[0.05]')}>{label}</button>
            ))}
          </nav>
        </aside>

        <section id="developer-content" tabIndex={-1} className="min-w-0 flex-1 rounded-[1.75rem] border border-gray-200 bg-white p-5 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-7">
          {sandbox ? <SandboxPanel /> : creatingNew
            ? <CreateProjectCard form={createForm} setForm={setCreateForm} busy={busy} error={error} onCreate={createProject} onCancel={() => setCreatingNew(false)} embedded />
            : <>
              {active && tab === 'overview' && <OverviewPanel project={active} onNavigate={setTab} />}
              {active && tab === 'products' && <ProductsPanel project={active} onConfigure={() => setTab('setup')} />}
              {active && tab === 'activity' && <PaymentActivityPanel key={active.id} projectId={active.id} />}
              {active && draft && tab === 'setup' && <SetupPanel draft={draft} setDraft={setDraft} institutions={institutions} institutionsLoading={institutionsLoading} busy={busy} onSave={() => void saveProject()} />}
              {active && tab === 'keys' && <KeysPanel project={active} keyNames={keyNames} setKeyNames={setKeyNames} newKey={newKey?.projectId === active.id ? newKey : null} busy={busy} onCreate={createKey} onRevoke={revokeKey} />}
              {active && draft && tab === 'webhooks' && <WebhookPanel draft={{ ...active, webhookUrl }} setDraft={value => setWebhookUrl(value.webhookUrl)} newSecret={newWebhookSecret?.projectId === active.id ? newWebhookSecret.value : ''} busy={busy} onSave={() => void saveProject({ ...active, webhookUrl })} onRotate={rotateWebhookSecret} savedUrl={active.webhookUrl} />}
              {active && tab === 'quickstart' && <><QuickstartPanel project={active} /><CliGuide projectId={active.id} /></>}
            </>}
          {!creatingNew && error && <Message tone="error">{error}</Message>}
          {notice && <Message tone="success">{notice}</Message>}
        </section>
      </div>
    </main>
  )
}

function CreateProjectCard({ form, setForm, busy, error, onCreate, onCancel, embedded = false, emptyAccount = false }: {
  form: CreateProjectForm
  setForm: Dispatch<SetStateAction<CreateProjectForm>>
  busy: boolean
  error: string
  onCreate: () => Promise<void>
  onCancel?: () => void
  embedded?: boolean
  emptyAccount?: boolean
}) {
  const content = <>
    {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 transition hover:text-gray-950 disabled:opacity-50 dark:text-gray-400 dark:hover:text-white"><ArrowLeft className="h-3.5 w-3.5" /> Back to projects</button>}
    <p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">New project</p>
    <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">Create your project.</h1>
    <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">Choose who will pay, then select the products you need. Human and agent projects use separate keys.</p>
    {emptyAccount && <p className="mt-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm leading-5 text-gray-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-400">No projects are linked to this sign-in. If you expected an existing project, sign out and use the email that created it.</p>}
    <CheckoutModePicker value={form.checkoutMode} onChange={checkoutMode => setForm(current => ({
      ...current,
      checkoutMode,
      capabilities: checkoutMode === 'agentic' ? current.capabilities.filter(capability => capability !== 'polymarket_funding') : current.capabilities,
    }))} />
    <div className="mt-6 space-y-4">
      <Field label="Platform name"><input className={fieldClass()} value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} placeholder={form.checkoutMode === 'agentic' ? 'Your platform agent' : 'Your platform'} /></Field>
      <Field label="Website"><input className={fieldClass()} value={form.website} onChange={event => setForm(current => ({ ...current, website: event.target.value }))} placeholder="https://yourplatform.com" /></Field>
      <Field label="What will customers pay for?"><textarea className={cn(fieldClass(), 'h-28 resize-none py-3 leading-5')} value={form.useCase} onChange={event => setForm(current => ({ ...current, useCase: event.target.value }))} placeholder="Describe the product and checkout flow." /></Field>
      {form.checkoutMode && <CapabilityPicker checkoutMode={form.checkoutMode} value={form.capabilities} onChange={capabilities => setForm(current => ({ ...current, capabilities }))} />}
    </div>
    {error && <Message tone="error">{error}</Message>}
    <div className={cn('mt-6 grid gap-2', onCancel && 'sm:grid-cols-[auto_1fr]')}>
      {onCancel && <button type="button" disabled={busy} onClick={onCancel} className="h-12 rounded-full border border-gray-200 px-5 text-sm font-semibold text-gray-600 dark:border-white/10 dark:text-gray-300">Cancel</button>}
      <button type="button" disabled={busy || !form.checkoutMode} onClick={() => void onCreate()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-40 dark:bg-white dark:text-gray-950">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create project
      </button>
    </div>
  </>
  return embedded ? <div>{content}</div> : <section className="mt-8 rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-card dark:border-white/10 dark:bg-[#111216] sm:p-8">{content}</section>
}

function CheckoutModePicker({ value, onChange }: { value: CheckoutMode | ''; onChange: (value: CheckoutMode) => void }) {
  const options: Array<{ key: CheckoutMode; icon: typeof UserRound; title: string; copy: string }> = [
    { key: 'human', icon: UserRound, title: 'Human checkout', copy: 'Hosted payer UI and funding flows for people. Supports human checkout products only.' },
    { key: 'agentic', icon: Bot, title: 'Agentic x402', copy: 'Fixed-price service payments for compatible agent wallets. No human payer fallback.' },
  ]
  return <div className="mt-6 grid gap-3 sm:grid-cols-2">{options.map(option => {
    const active = value === option.key
    const Icon = option.icon
    return <button key={option.key} type="button" onClick={() => onChange(option.key)} className={cn('rounded-2xl border p-4 text-left transition', active ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/10 dark:bg-blue-400/10' : 'border-gray-200 hover:border-blue-300 dark:border-white/10')}>
      <span className="flex items-center gap-2 text-sm font-semibold text-gray-950 dark:text-white"><Icon className="h-4 w-4 text-blue-600 dark:text-blue-300" />{option.title}</span>
      <span className="mt-2 block text-sm leading-5 text-gray-500 dark:text-gray-400">{option.copy}</span>
    </button>
  })}</div>
}

function CapabilityPicker({ checkoutMode, value, onChange }: { checkoutMode: CheckoutMode; value: Capability[]; onChange: (value: Capability[]) => void }) {
  return <ProductPicker mode={checkoutMode} value={value} onChange={onChange}/>
}

function SetupPanel({ draft, setDraft, institutions, institutionsLoading, busy, onSave }: { draft: Project; setDraft: (project: Project) => void; institutions: Institution[]; institutionsLoading: boolean; busy: boolean; onSave: () => void }) {
  const bankAccountNumber = draft.bankAccountNumber ?? ''
  const routingRequired = needsSettlementRouting(draft.capabilities)
  const agreementOnly = draft.capabilities.includes('arc_agreements') && !draft.capabilities.some(capability=>['hosted_checkout','polymarket_funding'].includes(capability))
  const supportedNetworks = developerProductNetworks(draft.checkoutMode, draft.capabilities)
  const unsupportedNetworks = draft.networks.some(network => !supportedNetworks.includes(network))
  function updateProducts(capabilities: Capability[]) {
    const supported = developerProductNetworks(draft.checkoutMode, capabilities)
    let networks = draft.networks.filter(network => supported.includes(network))
    if (!networks.length) networks = [...supported]
    const onlyAgreements = !capabilities.includes('hosted_checkout')
    setDraft({ ...draft, capabilities, networks, ...(onlyAgreements ? { settlementMode: 'usdc' as const } : {}), defaultNetwork: networks.includes(draft.defaultNetwork) ? draft.defaultNetwork : networks[0] ?? 'arc' })
  }
  function toggleNetwork(network: Network) {
    const selected = draft.networks.includes(network)
    const networks = selected ? draft.networks.filter(item => item !== network) : [...draft.networks, network]
    if (!networks.length) return
    setDraft({ ...draft, networks, defaultNetwork: networks.includes(draft.defaultNetwork) ? draft.defaultNetwork : networks[0] })
  }
  return <div>
    {draft.checkoutMode === 'agentic' && draft.networks.some(network => !isAgentCheckoutNetwork(network)) && <div role="alert" className="mb-4 rounded-xl border border-amber-300 p-4 text-sm">Agent checkout now supports Base and Arc only. Remove unsupported routes, then save your settings. <button type="button" className="ml-2 underline" onClick={() => { const networks = draft.networks.filter(isAgentCheckoutNetwork); if (!networks.length) networks.push('base'); setDraft({ ...draft, networks, defaultNetwork: networks.includes(draft.defaultNetwork as 'base' | 'arc') ? draft.defaultNetwork : networks[0] }) }}>Remove unsupported networks</button></div>}
    {unsupportedNetworks && <div role="alert" className="mb-4 rounded-xl border border-amber-300 p-4 text-sm">Some saved networks do not support the selected products. <button type="button" className="ml-2 underline" onClick={() => updateProducts(draft.capabilities)}>Use supported networks</button></div>}
    <PanelHeader eyebrow="Project" title="Settings" copy="Configure the products, receiving accounts and return URLs for this project." status={draft.operationalStatus === 'suspended' ? 'Suspended' : draft.settlementStatus === 'ready' ? 'Configured' : 'Setup required'} />
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <Field label="Platform name"><input className={fieldClass()} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
      <Field label="Website"><input className={fieldClass()} value={draft.website} onChange={event => setDraft({ ...draft, website: event.target.value })} /></Field>
    </div>
    <Field label="What customers pay for" className="mt-4"><textarea className={cn(fieldClass(), 'h-24 resize-none py-3')} value={draft.useCase} onChange={event => setDraft({ ...draft, useCase: event.target.value })} /></Field>
    <div className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <p className="flex items-center gap-2 text-xs font-semibold text-gray-950 dark:text-white">{draft.checkoutMode === 'agentic' ? <Bot className="h-4 w-4 text-blue-600" /> : <UserRound className="h-4 w-4 text-blue-600" />}{draft.checkoutMode === 'agentic' ? 'Agentic x402 project' : 'Human checkout project'}</p>
      <p className="mt-2 text-sm leading-5 text-gray-500 dark:text-gray-400">This payment path is locked to the project and every API key it issues. Create a separate project to use the other path.</p>
    </div>
    <CapabilityPicker checkoutMode={draft.checkoutMode} value={draft.capabilities} onChange={updateProducts} />

    <div className="mt-7 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <div className="flex items-start gap-3">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/10">
          <img
            src={draft.brandImageUrl || '/hash-logo-transparent.png'}
            alt="Checkout brand mark preview"
            className={cn('h-8 w-8 object-contain', !draft.brandImageUrl && 'invert dark:invert-0')}
            onError={event => {
              if (event.currentTarget.getAttribute('src') === '/hash-logo-transparent.png') { event.currentTarget.style.visibility = 'hidden'; return }
              event.currentTarget.onerror = null
              event.currentTarget.src = '/hash-logo-transparent.png'
              event.currentTarget.className = 'h-8 w-8 object-contain invert dark:invert-0'
            }}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-900 dark:text-white">Checkout brand mark</p>
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">A square PNG, WebP, or JPG shown beside your platform name on checkout and receipts. Host it on the same origin as your website.</p>
        </div>
      </div>
      <Field label="Brand mark URL" className="mt-3"><input className={fieldClass()} value={draft.brandImageUrl} onChange={event => setDraft({ ...draft, brandImageUrl: event.target.value })} placeholder="https://yourplatform.com/brand/mark.png" /></Field>
    </div>

    {routingRequired && <><div className="mt-7">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">Settlement for checkout and Arc agreements</p>
      {draft.checkoutMode === 'agentic' || agreementOnly
        ? <div className="mt-2 rounded-xl bg-gray-100 px-3 py-3 text-xs font-semibold text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">Receive USDC</div>
        : <div className="mt-2 grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1 dark:bg-white/[0.05]">
          {[['usdc', 'Receive USDC'], ['ngn', 'Receive Naira']] .map(([value, label]) => <button key={value} type="button" onClick={() => setDraft({ ...draft, settlementMode: value as 'usdc' | 'ngn', ...(value === 'ngn' ? { networks: ['base'], defaultNetwork: 'base', recipients: {} } : {}) })} className={cn('rounded-xl px-3 py-2.5 text-xs font-semibold transition', draft.settlementMode === value ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>{label}</button>)}
        </div>}
      {draft.settlementMode === 'ngn' && <p className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">Payers use Base USDC. Paycrest sends the Naira settlement to your verified bank account.</p>}
    </div>

    <div className="mt-7">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{agreementOnly ? 'Arc agreement settlement' : 'Settlement networks'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NETWORKS.filter(network => network.key !== 'solana' && supportedNetworks.includes(network.key)).map(network => {
          const active = network.key !== 'solana' && draft.networks.includes(network.key)
          const disabled = network.disabled || (draft.settlementMode === 'ngn' && network.key !== 'base')
          return <button key={network.key} type="button" disabled={disabled} onClick={() => network.key !== 'solana' && toggleNetwork(network.key)} className={cn('flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition', active ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/10 dark:bg-blue-400/15 dark:text-blue-200' : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:bg-blue-50/60 dark:border-white/10 dark:text-gray-400 dark:hover:bg-blue-400/10', disabled && 'cursor-not-allowed opacity-45')}>{network.label}{network.note && <span className="text-xs font-black uppercase opacity-70">{network.note}</span>}</button>
        })}
      </div>
    </div>

    {draft.capabilities.includes('arc_agreements') && <p className="mt-3 text-sm leading-6 text-gray-500">Arc agreements use USDC on Arc Mainnet.{draft.checkoutMode === 'human' && ' X Layer agreements and Swap use the networks selected in their own sections above.'}</p>}
    <div className="mt-5 space-y-3">
      {draft.settlementMode === 'usdc' && draft.networks.filter(network => supportedNetworks.includes(network)).map(network => <Field key={network} label={`${network === 'arc' ? 'Arc' : network[0].toUpperCase() + network.slice(1)} receiving address`}>
        <input className={fieldClass()} value={draft.recipients[network] ?? ''} onChange={event => setDraft({ ...draft, recipients: { ...draft.recipients, [network]: event.target.value } })} placeholder="0x..." />
      </Field>)}
      {draft.settlementMode === 'usdc' && <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{draft.capabilities.includes('arc_agreements') ? 'The Arc address is the fixed project recipient for Agreements. Paying different workers or sellers requires the backend verified-recipient integration; do not substitute a platform wallet for their payout wallets. This is not an escrow deposit address.' : 'Enter the treasury or Circle wallet address that should receive payments on each enabled network.'}</p>}
    </div>

    {draft.settlementMode === 'usdc' && <Field label="Default network" className="mt-4"><PocketSelect value={draft.defaultNetwork} options={draft.networks.filter(network => supportedNetworks.includes(network)).map(network => ({ value: network, label: network === 'arc' ? 'Arc' : network[0].toUpperCase() + network.slice(1) }))} onChange={value => setDraft({ ...draft, defaultNetwork: value as Network })} ariaLabel="Default payment network" /></Field>}
    </>}
    {!routingRequired && <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-500 dark:bg-white/5">No project receiving address is needed for these products. Swaps use the connected user wallet; X Layer agreement recipients and eligible stock assets are bound to each agreement.</p>}
    <Field label="Allowed return origin" className="mt-4"><input className={fieldClass()} value={draft.allowedOrigins[0] ?? ''} onChange={event => setDraft({ ...draft, allowedOrigins: [event.target.value] })} placeholder="https://yourplatform.com" /></Field>

    {draft.settlementMode === 'ngn' && <div className="mt-6 grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2">
      <Field label="Bank" className="sm:col-span-2"><PocketSelect value={draft.bankCode} options={institutions.map(bank => ({ value: bank.code, label: bank.name }))} onChange={value => { const bank = institutions.find(item => item.code === value); setDraft({ ...draft, bankCode: value, bankName: bank?.name ?? '', bankAccountNumber: '', bankVerifiedAt: undefined }) }} disabled={institutionsLoading} placeholder={institutionsLoading ? 'Loading banks…' : 'Select bank'} ariaLabel="Naira settlement bank" /></Field>
      <Field label="Account number"><input className={fieldClass()} inputMode="numeric" value={bankAccountNumber} onChange={event => setDraft({ ...draft, bankAccountNumber: event.target.value, bankVerifiedAt: undefined })} placeholder={draft.bankAccountLast4 ? `••••••${draft.bankAccountLast4}` : '10-digit account'} /></Field>
      <Field label="Account name"><input className={fieldClass()} value={draft.bankAccountName} readOnly={Boolean(draft.bankVerifiedAt && !bankAccountNumber)} onChange={event => setDraft({ ...draft, bankAccountName: event.target.value, bankVerifiedAt: undefined })} placeholder="Verified after save" /></Field>
      <Field label="USDC refund address" className="sm:col-span-2"><input className={fieldClass()} value={draft.refundAddress} onChange={event => setDraft({ ...draft, refundAddress: event.target.value })} placeholder="0x..." /></Field>
      {draft.bankVerifiedAt && <p className="sm:col-span-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /> Bank account verified</p>}
    </div>}
    <button type="button" disabled={busy} onClick={onSave} className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</button>
  </div>
}

function KeysPanel({ project, keyNames, setKeyNames, newKey, busy, onCreate, onRevoke }: { project: Project; keyNames: Record<'test' | 'live', string>; setKeyNames: (value: Record<'test' | 'live', string>) => void; newKey: { value: string; environment: 'test' | 'live' } | null; busy: boolean; onCreate: (environment: 'test' | 'live') => void; onRevoke: (id: string) => void }) {
  function keyEnvironment(key: Project['keys'][number]): 'test' | 'live' {
    return key.environment ?? (key.prefix.startsWith('hpl_test_') ? 'test' : 'live')
  }

  function environmentSection(environment: 'test' | 'live', title: string, scope: string) {
    const keys = project.keys.filter(key => keyEnvironment(key) === environment)
    return <section className="rounded-2xl border border-gray-200 p-4 dark:border-white/10 sm:p-5">
      <h3 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">{scope}</p>
      {newKey?.environment === environment && <SecretReveal label="Copy this key now" value={newKey.value} />}
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
        <input className={fieldClass()} value={keyNames[environment]} onChange={event => setKeyNames({ ...keyNames, [environment]: event.target.value })} aria-label={`${title} key name`} placeholder="Key name" />
        <button type="button" disabled={environment === 'test' || !needsSettlementRouting(project.capabilities) || busy || project.settlementStatus !== 'ready' || project.operationalStatus === 'suspended' || !keyNames[environment].trim()} onClick={() => onCreate(environment)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950"><Plus className="h-4 w-4" /> Create API key</button>
      </div>
      <div className="mt-4 space-y-2">{keys.length ? keys.map(key => <div key={key.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-gray-300"><KeyRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{key.name}</p><p className="mt-0.5 font-mono text-xs text-gray-400">{key.prefix}••••</p>{key.scopes && <p className="mt-1 text-xs text-gray-500">Scoped backend key · {key.expiresAt && Date.parse(key.expiresAt) <= Date.now() ? 'Expired' : 'Expires ' + new Date(key.expiresAt!).toLocaleDateString()}</p>}</div>{key.revokedAt ? <span className="text-xs font-semibold text-gray-400">Revoked</span> : <button type="button" disabled={busy} onClick={() => onRevoke(key.id)} className="text-xs font-semibold text-red-500">Revoke</button>}</div>) : <EmptyState icon={KeyRound} text={`No ${environment} keys yet.`} />}</div>
    </section>
  }

  return <div><PanelHeader eyebrow="Credentials" title="API keys" copy="Keys authenticate your backend for this project. Keep their values in your server secret manager." />
    <div className="mt-5 rounded-xl border border-gray-200 px-3 py-3 text-xs font-semibold text-gray-700 dark:border-white/10 dark:text-gray-200">{project.checkoutMode === 'agentic' ? 'Agent project keys' : 'Human project keys'} <span className="ml-1 font-normal text-gray-400">Access follows the enabled products, network rules and key scopes.</span></div>
    {project.settlementStatus !== 'ready' && <p className="mt-5 text-xs text-amber-600 dark:text-amber-300">Complete and save the active settlement configuration before creating a key.</p>}
    {project.operationalStatus === 'suspended' && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">This project is suspended. {project.suspensionReason || 'Contact Hash PayLink operations before creating new credentials.'}</p>}
    <p className="mt-4 text-sm leading-6 text-gray-500">Swap requires a separate <code>wallet:swap</code> key. X Layer agreements require <code>xstocks-agreement:read</code> and <code>xstocks-agreement:create</code>. Create these using the owner-approved CLI; general checkout keys do not enable Swap.</p>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {environmentSection('test', 'Sandbox keys - unavailable', `New sandbox keys are disabled until test environments are connected. Existing keys remain separate from live keys. Project mode: ${project.checkoutMode === 'agentic' ? 'agentic x402' : 'human checkout'}.`)}
      {environmentSection('live', 'Live keys', `General keys use configured settlement routes. Create separate scoped keys through the CLI for wallet operations.`)}
    </div>
  </div>
}

function WebhookPanel({ draft, setDraft, newSecret, busy, onSave, onRotate, savedUrl }: { draft: Project; setDraft: (project: Project) => void; newSecret: string; busy: boolean; onSave: () => void; onRotate: () => void; savedUrl: string }) {
  const webhookEvents = [
    'checkout.created',
    'payment.processing',
    'payment.confirmed',
    'payment.failed',
    ...(draft.capabilities.includes('arc_agreements') ? [
      'agreement.activated',
      'agreement.step_released',
      'agreement.completed',
      'agreement.cancelled',
      'agreement.refunded',
    ] : []),
  ]
  return <div><PanelHeader eyebrow="Events" title="Webhooks" copy="Receive signed payment updates on your backend. Never fulfill from a browser redirect alone." />
    <Field label="Webhook URL" className="mt-7"><input className={fieldClass()} value={draft.webhookUrl} onChange={event => setDraft({ ...draft, webhookUrl: event.target.value })} placeholder="https://api.yourplatform.com/webhooks/hashpaylink" /></Field>
    <button type="button" disabled={busy} onClick={onSave} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-white/10 dark:text-gray-200 dark:hover:bg-white/[0.05]">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save changes</button>
    {newSecret && <SecretReveal label="Copy this signing secret now" value={newSecret} />}
    <button type="button" disabled={busy || !savedUrl || draft.webhookUrl !== savedUrl} onClick={onRotate} className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gray-950 text-xs font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950"><RotateCw className="h-4 w-4" /> {draft.webhookConfigured ? 'Rotate signing secret' : 'Create signing secret'}</button>
    <div className="mt-6 grid gap-2 sm:grid-cols-2">{webhookEvents.map(event => <div key={event} className="rounded-xl border border-gray-200 px-3 py-2 font-mono text-xs text-gray-500 dark:border-white/10 dark:text-gray-400">{event}</div>)}</div>
    <div className="mt-7"><p className="text-xs font-semibold text-gray-900 dark:text-white">Recent deliveries</p><div className="mt-3 space-y-2">{draft.webhookDeliveries?.length ? [...draft.webhookDeliveries].reverse().slice(0, 8).map(delivery => <div key={delivery.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2.5 dark:border-white/10"><span className={cn('flex h-7 w-7 items-center justify-center rounded-lg', delivery.status === 'delivered' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300' : 'bg-red-50 text-red-500 dark:bg-red-400/10 dark:text-red-300')}>{delivery.status === 'delivered' ? <ShieldCheck className="h-3.5 w-3.5" /> : <Webhook className="h-3.5 w-3.5" />}</span><div className="min-w-0 flex-1"><p className="truncate font-mono text-xs text-gray-700 dark:text-gray-200">{delivery.event}</p><p className="mt-0.5 text-xs text-gray-400">{delivery.responseStatus ? `HTTP ${delivery.responseStatus}` : delivery.status}</p></div></div>) : <EmptyState icon={Webhook} text="No webhook deliveries yet." />}</div></div>
  </div>
}

function QuickstartPanel({ project }: { project: Project }) {
  const paymentPath = project.checkoutMode
  const hasCheckout = project.capabilities.includes('hosted_checkout')
  const hasAgreements = project.capabilities.includes('arc_agreements')
  const hasFunding = project.capabilities.includes('polymarket_funding')
  const fundingCode = `const response = await fetch("https://developer.hashpaylink.com/api/v2/funding/polymarket/checkouts", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Content-Type": "application/json",\n    "Idempotency-Key": "funding_order_0001"\n  },\n  body: JSON.stringify({\n    polymarketWallet: customer.polymarketWallet,\n    amount: "10",\n    returnUrl: "${project.allowedOrigins[0] ?? project.website}/complete"\n  })\n});\nif (!response.ok) throw new Error("Funding request failed");\nconst funding = await response.json();\n// Read the funding status API; payment confirmation is not bridge completion.`
  const modeFields = `    checkoutMode: "${paymentPath}",${paymentPath === 'agentic' ? '\n    agenticType: "agent_treasury",\n    network: process.env.HASH_PAYLINK_NETWORK,' : ''}`
  const createCode = `const checkout = await fetch("https://app.hashpaylink.com/api/v2/checkouts", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Idempotency-Key": order.id,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    kind: "service",\n${modeFields}\n    title: "Premium plan",\n    amount: "10",\n    returnUrl: "${project.allowedOrigins[0] ?? project.website}/complete"\n  })\n}).then(res => res.json());`
  const checkoutCode = paymentPath === 'human'
    ? `${createCode}\n\n// Send a person to Hash PayLink's hosted checkout.\nwindow.location.assign(new URL(checkout.checkoutUrl, "https://app.hashpaylink.com"));`
    : `${createCode}\n\n// Send an agent-wallet user to the hosted Circle wallet checkout.\nconst payerUrl = new URL(checkout.checkoutUrl, "https://app.hashpaylink.com").toString();\n\n// Autonomous agents can use the protocol endpoint directly.\n// The first GET returns HTTP 402 + PAYMENT-REQUIRED.\nconst agentPaymentUrl = new URL(\n  checkout.agentPaymentUrl,\n  "https://app.hashpaylink.com"\n).toString();`
  const agreementPayerEmail = paymentPath === 'human' ? '\n    payerEmail: customer.email,' : ''
  const agreementCode = `const agreement = await fetch("https://app.hashpaylink.com/api/v2/agreements", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Idempotency-Key": order.id,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    template: "fixed_unlock",\n    externalId: order.id,\n    resourceId: "content:premium-report",\n    title: "Premium report access",\n    description: "Unlock one premium research report.",\n    amount: "10",${agreementPayerEmail}\n    recipient: process.env.HASH_PAYLINK_ARC_RECIPIENT,\n    durationSeconds: 86400,\n    cancellationWindowSeconds: 900\n  })\n}).then(res => res.json());\n\n${paymentPath === 'human' ? '// Send agreement.payerReviewPath only to the named customer.' : '// Prepare this agreement through the dedicated agent payer route.'}\n// Mainnet activation is not enabled until deployment review is complete.`
  return <div><PanelHeader eyebrow="Integration" title="Docs & CLI" copy={`This project and its keys are restricted to the ${paymentPath === 'agentic' ? 'agentic' : 'human'} path.`} />
    {hasCheckout && <div className="mt-4 rounded-2xl bg-[#08090c] p-4 text-white"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-white/40">Checkout · server only</span><CopyButton value={checkoutCode} /></div><pre className="mt-4 overflow-x-auto whitespace-pre text-sm leading-5 text-white/70">{checkoutCode}</pre></div>}
    {hasAgreements && <div className="mt-4 rounded-2xl bg-[#08090c] p-4 text-white"><div className="flex items-center justify-between"><span className="text-xs font-semibold uppercase tracking-wider text-white/40">Arc Agreements · private pilot</span><CopyButton value={agreementCode} /></div><pre className="mt-4 overflow-x-auto whitespace-pre text-sm leading-5 text-white/70">{agreementCode}</pre></div>}
    {hasCheckout && <div className="mt-4 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
      <p className="flex items-center gap-2 text-xs font-semibold text-gray-900 dark:text-white">{paymentPath === 'agentic' ? <Bot className="h-4 w-4 text-blue-600" /> : <UserRound className="h-4 w-4 text-blue-600" />}{paymentPath === 'agentic' ? 'Agentic x402' : 'Human checkout'}</p>
      <p className="mt-2 text-sm leading-5 text-gray-500 dark:text-gray-400">{paymentPath === 'agentic' ? <>Create with <code>checkoutMode: "agentic"</code> and one enabled <code>network</code>. Open <code>checkoutUrl</code> for the authenticated Circle Agent Wallet payer flow, or give <code>agentPaymentUrl</code> to an autonomous x402 client. No human-wallet fallback is issued.</> : <>Create with <code>checkoutMode: "human"</code>, then open <code>checkoutUrl</code>. The payer chooses from this project's enabled human payment routes.</>}</p>
    </div>}
    {hasFunding && <div className="mt-5 rounded-2xl bg-[#08090c] p-4 text-white"><div className="flex items-center justify-between gap-3"><h2 className="text-sm font-semibold">Polymarket Funding - Live only</h2><CopyButton value={fundingCode} /></div><p className="mt-3 text-sm leading-6 text-white/70">Use an eligible Polymarket wallet and an enabled Base or Arbitrum route. The API enforces the current minimum amount. No sandbox or Arc bridge is available.</p><pre className="mt-4 overflow-x-auto whitespace-pre text-xs leading-6 text-white/80">{fundingCode}</pre></div>}
    {hasAgreements && <ArcPilotStatus project={project} />}
    <div className="mt-5 rounded-2xl border border-gray-200 p-4 dark:border-white/10"><h2 className="text-sm font-semibold">Backend configuration</h2><p className="mt-2 text-sm leading-6 text-gray-500">Inject your API key from a secret manager. Never include it in browser or mobile builds.</p><code className="mt-3 block break-all text-xs">HASHPAYLINK_API_KEY=&lt;your live project key&gt;</code><p className="mt-3 text-sm text-gray-500">Configured routes: {project.networks.join(', ') || 'Complete project settings'}.</p></div>
    <Link to="/docs/api" className="mt-5 inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-300">Open API reference <ChevronRight className="h-3.5 w-3.5" /></Link>
  </div>
}

function ArcPilotStatus({ project }: { project: Project }) {
  const pilot = project.arcAgreementPilot
  const label = pilot?.status === 'approved' ? 'Project approved' : pilot?.status === 'disabled' ? 'Disabled' : 'Draft only'
  return <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-blue-900 dark:text-blue-100">Arc Agreements · Private pilot</p><span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-blue-700 dark:bg-white/10 dark:text-blue-200">{label}</span></div><p className="mt-2 text-sm leading-5 text-blue-800/80 dark:text-blue-100/70">Agreements use Arc only. Mainnet activation remains unavailable until the deployment and operator are reviewed. Project approval alone does not enable funding.</p>{pilot?.status === 'approved' && <p className="mt-3 text-xs leading-5 text-blue-700/70 dark:text-blue-200/60">Up to {pilot.maxAgreementUsdc} USDC per agreement · {pilot.dailyVolumeUsdc} USDC daily · {pilot.maxActiveAgreements} active · {Math.round(pilot.maxDurationSeconds / 3600)}h maximum</p>}</div>
}

function PortalTop({ onLogout }: { onLogout: () => Promise<void> }) { return <header className="flex items-center justify-end"><button type="button" onClick={() => void onLogout()} className="flex h-9 items-center gap-1.5 rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-500 dark:border-white/10 dark:text-gray-300"><LogOut className="h-3.5 w-3.5" /> Sign out</button></header> }
function PortalLoading({ delayed = false }: { delayed?: boolean }) {
  return <main className="mx-auto flex min-h-[calc(100dvh-7rem)] max-w-xl items-center px-4 py-12">
    <section className="w-full rounded-[1.75rem] border border-gray-200 bg-white p-7 text-center shadow-[0_24px_80px_rgba(15,23,42,.08)] dark:border-white/10 dark:bg-[#111216]">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300"><Loader2 className="h-5 w-5 animate-spin" /></span>
      <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em] text-gray-950 dark:text-white">Securing your developer session</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500 dark:text-gray-400">Checking Privy identity before loading projects, API keys, and payment routing.</p>
      {delayed && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-400/20 dark:bg-amber-400/10"><p className="text-xs leading-5 text-amber-800 dark:text-amber-200">Identity verification is taking longer than expected. Check your connection, then retry.</p><button type="button" onClick={() => window.location.reload()} className="mt-3 h-9 rounded-full bg-gray-950 px-4 text-xs font-semibold text-white dark:bg-white dark:text-gray-950">Retry securely</button></div>}
    </section>
  </main>
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={cn('block space-y-1.5', className)}><span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>{children}</label> }
function PanelHeader({ eyebrow, title, copy, status }: { eyebrow: string; title: string; copy: string; status?: string }) { return <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{copy}</p></div>{status && <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', status === 'Configured' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : status === 'Suspended' ? 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300')}>{status}</span>}</div> }
function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) { return <p role={tone === 'error' ? 'alert' : 'status'} className={cn('mt-5 rounded-xl border px-3 py-2 text-xs font-medium', tone === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200')}>{children}</p> }
function SecretReveal({ label, value }: { label: string; value: string }) { return <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-blue-900 dark:text-blue-100">{label}</p><p className="mt-1 text-xs text-blue-700/70 dark:text-blue-200/60">It will not be shown again.</p></div><CopyButton value={value} /></div><code className="mt-3 block break-all rounded-xl bg-white/70 p-3 text-xs text-blue-900 dark:bg-black/20 dark:text-blue-100">{value}</code></div> }
function ProjectIdCard({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Project ID</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-200" title={value}>{value}</code><button type="button" aria-label="Copy developer project ID" onClick={async () => { await copyToClipboard(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-500 transition hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:text-white"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button></div></div> }
function CopyButton({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button type="button" onClick={async () => { await copyToClipboard(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2.5 text-xs font-semibold text-current"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button> }
function EmptyState({ icon: Icon, text }: { icon: typeof Webhook; text: string }) { return <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 text-gray-400 dark:border-white/10"><Icon className="h-5 w-5" /><p className="mt-2 text-xs">{text}</p></div> }
