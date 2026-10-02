import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { createPortal } from 'react-dom'
import { usePrivy } from '@privy-io/react-auth'
import { ArrowLeft, ArrowUpRight, ChevronRight, Layers3, LogOut, Menu, RefreshCw, ShieldCheck, X } from 'lucide-react'
import ProjectOperations, { OperationsLoading, OperationsSignIn } from './DeveloperOperationsPage'
import ArcAgreementOperationsPanel from '../components/ArcAgreementOperationsPanel'
import XStocksReviewOperationsPanel from '../components/XStocksReviewOperationsPanel'
import PocketSupportOperationsPanel from '../components/PocketSupportOperationsPanel'
import PocketTransactionOperationsPanel from '../components/PocketTransactionOperationsPanel'
import { cn } from '../lib/utils'
import DeveloperLoadingSkeleton from '../components/DeveloperLoadingSkeleton'

type Section = 'projects' | 'agreements' | 'trade-disputes' | 'support' | 'transactions'
type Workspace = { id: string; name: string; projectIds: string[]; sections: Section[]; missingProjectIds: string[];
  integrations: Array<{ id: string; name: string; capabilities: string[]; status: string }> }
type Session = { founder: boolean; email: string; workspaces: Workspace[]; arcActivationEnabled: boolean }
const labels: Record<Section, string> = { projects: 'Integrations', agreements: 'Arc agreements', 'trade-disputes': 'Trade disputes', support: 'Support inbox', transactions: 'Transactions' }
const descriptions: Record<Section, string> = {
  projects: 'Project access, routing and integration history.', agreements: 'Agreement lifecycle, activation limits and controlled operations.',
  'trade-disputes': 'Evidence, decisions and reviewer approvals.', support: 'Pocket customer conversations and Agent Hash handoffs.',
  transactions: 'Unresolved Pocket payments and reconciliation.',
}
const path = (id: string, section?: string) => '/admin/workspaces/' + encodeURIComponent(id) + (section ? '/' + section : '')
const card = 'rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#111216]'

export default function OperationsWorkspacePage() {
  const { ready, authenticated, user, getAccessToken, logout } = usePrivy()
  const { workspaceId, section } = useParams()
  const [state, setState] = useState<{ owner: string; session: Session }>()
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  const [menuOpen, setMenuOpen] = useState(false)
  const menu = useRef<HTMLDialogElement>(null)
  const identity = authenticated ? user?.id : undefined
  useEffect(() => { setMenuOpen(false) }, [workspaceId, section, identity, reload])
  useEffect(() => {
    if (menuOpen && menu.current && !menu.current.open) menu.current.showModal()
    else if (!menuOpen && menu.current?.open) menu.current.close()
  }, [menuOpen])
  useEffect(() => {
    let current = true
    setState(undefined); setError('')
    if (!ready || !authenticated || !identity) return
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token) throw Error('Sign in again to open operations.')
        const response = await fetch('/api/operations-session', { cache: 'no-store', headers: { authorization: 'Bearer ' + token } })
        const data = await response.json()
        if (!response.ok || !data.ok) throw Error(data.error || 'Operations could not be loaded.')
        if (current) setState({ owner: identity, session: data })
      } catch (e) { if (current) setError(e instanceof Error ? e.message : 'Operations could not be loaded.') }
    })()
    return () => { current = false }
  }, [ready, authenticated, identity, reload]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return <OperationsLoading />
  if (!authenticated) return <OperationsSignIn />
  const session = state && state.owner === identity ? state.session : undefined
  if (!session && !error) return <DeveloperLoadingSkeleton />
  if (!session) return <main id="developer-content" className="mx-auto max-w-xl px-6 py-20">
    <h1 className="text-2xl font-semibold">Hash PayLink Operations</h1>
    <p role={error ? 'alert' : 'status'} className="mt-4 text-sm text-gray-500">{error || 'Checking your operations access…'}</p>
    {error && <div className="mt-6 flex gap-3"><button className="developer-primary" onClick={() => setReload(v => v + 1)}>Retry</button><button onClick={() => void logout()}>Sign out</button></div>}
  </main>
  const workspace = session.workspaces.find(w => w.id === workspaceId)
  const authorizedSection = workspace?.sections.includes(section as Section)
  const invalid = Boolean(workspaceId && !workspace) || Boolean(section && !authorizedSection && section !== 'escalations')
    || Boolean(section === 'escalations' && (workspace?.id === 'pocket' || !session.founder))
  const contextKey = `${identity}:${workspaceId}:${section || 'overview'}`
  const menuSlot = document.getElementById('operations-navigation-trigger')
  const titleSlot = document.getElementById('operations-workspace-title')
  return <div className="min-h-[calc(100dvh-4rem)]">
    {menuSlot && createPortal(<button type="button" aria-label="Open navigation" aria-controls="operations-menu" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10"><Menu className="h-5 w-5" /></button>, menuSlot)}
    {titleSlot && createPortal(<span>{workspace?.name || 'Operations'}</span>, titleSlot)}
    <dialog id="operations-menu" ref={menu} aria-label="Operations menu" onCancel={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} onClick={e => { if (e.target === e.currentTarget) setMenuOpen(false) }} className="fixed inset-y-0 left-0 right-auto m-0 h-dvh max-h-none w-[min(20rem,calc(100vw-3rem))] max-w-none border-0 bg-white p-0 text-gray-950 shadow-xl backdrop:bg-black/40 dark:bg-[#0d0d0e] dark:text-white">
    <aside className="relative flex min-h-full flex-col p-5" onClick={e => { if ((e.target as HTMLElement).closest('a')) setMenuOpen(false) }}>
      <button type="button" aria-label="Close navigation" onClick={() => setMenuOpen(false)} className="absolute right-3 top-3 flex h-11 w-11 items-center justify-center rounded-xl hover:bg-gray-100 dark:hover:bg-white/10"><X className="h-5 w-5" /></button>
      <Link to="/admin" className="flex min-h-11 items-center gap-2 text-sm font-semibold"><Layers3 className="h-4 w-4" />Operations</Link>
      <p className="mt-1 text-xs text-gray-500">{session.founder ? 'Founder access' : 'Team access'}</p>
      <p className="mt-6 text-xs font-medium text-gray-500">Products</p>
      <nav aria-label="Product workspaces" className="mb-6 mt-3 flex flex-col gap-1">
        {session.workspaces.map(w => <Link key={w.id} to={path(w.id)} aria-current={workspace?.id === w.id ? 'page' : undefined} className={cn('min-h-11 rounded-xl px-3 py-3 text-sm font-medium', workspace?.id === w.id ? 'bg-gray-100 text-gray-950 dark:bg-white/10 dark:text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5')}>{w.name}</Link>)}
      </nav>
      <div className="mt-auto border-t border-gray-200 pt-4 dark:border-white/10">
        <Link to="/" className="flex min-h-11 items-center justify-between text-xs text-gray-500">Developer portal<ArrowUpRight className="h-3.5 w-3.5" /></Link>
        <button onClick={() => void logout()} className="flex min-h-11 w-full items-center justify-between text-xs text-gray-500">Sign out<LogOut className="h-3.5 w-3.5" /></button>
      </div>
    </aside>
    </dialog>
    {workspace && <nav aria-label="Workspace sections" className="flex gap-5 overflow-x-auto border-b border-gray-200 bg-white px-5 dark:border-white/10 dark:bg-[#0a0a0a] sm:px-8 xl:px-10">
      <SectionLink to={path(workspace.id)} active={!section}>Overview</SectionLink>
      {workspace.sections.map(s => <SectionLink key={s} to={path(workspace.id, s)} active={section === s}>{labels[s]}</SectionLink>)}
      {workspace.id !== 'pocket' && session.founder && <SectionLink to={path(workspace.id, 'escalations')} active={section === 'escalations'}>Escalations</SectionLink>}
    </nav>}
    <main id="developer-content" className="min-w-0 px-5 py-7 sm:px-8 xl:px-10">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-6 dark:border-white/10">
        <div>
          {workspace && <Link to="/admin" className="mb-3 inline-flex items-center gap-1 text-xs text-gray-500"><ArrowLeft className="h-3 w-3" />All products</Link>}
          <h1 className="text-2xl font-semibold tracking-[-0.035em]">{invalid ? 'Workspace unavailable' : workspace?.name || 'Products'}</h1>
          <p className="mt-2 text-sm text-gray-500">{invalid ? 'Your account does not have access to this workspace section.' : workspace ? section === 'escalations' ? 'Cases submitted by this product’s support team.' : section ? descriptions[section as Section] : 'Manage this product’s connected operations.' : 'Choose a product to manage its operations.'}</p>
        </div>
        <button onClick={() => setReload(v => v + 1)} className="flex min-h-11 items-center gap-2 rounded-full border border-gray-200 px-4 text-xs font-semibold dark:border-white/10"><RefreshCw className="h-3.5 w-3.5" />Refresh access</button>
      </header>
      {invalid ? <p role="alert" className="mt-8 text-sm text-gray-500">Choose an available product from the workspace selector.</p> : !workspace ? <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {session.workspaces.map(w => <Link to={path(w.id)} key={w.id} className={cn(card, 'group p-6 transition hover:border-gray-400 dark:hover:border-white/30')}>
          <div className="flex items-center justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-100 font-semibold dark:bg-white/10">{w.name.slice(0, 1)}</span><ChevronRight className="h-4 w-4 text-gray-400" /></div>
          <h2 className="mt-5 text-base font-semibold">{w.name}</h2><p className="mt-2 text-xs leading-6 text-gray-500">{w.sections.map(s => labels[s]).join(' · ')}</p>
          <p className="mt-5 text-xs text-gray-400">{w.id === 'pocket' ? 'Hash PayLink product' : `${w.integrations.length} connected integration${w.integrations.length === 1 ? '' : 's'}`}</p>
        </Link>)}
      </div> : <div key={contextKey}>
        {workspace.missingProjectIds.length > 0 && <p role="alert" className="mt-5 rounded-xl border border-amber-200 p-4 text-sm text-amber-800">Some mapped integrations are unavailable. Review the workspace mapping before operating.</p>}
        {!section && <>
          <div className="mt-7 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{workspace.sections.map(s => <Link key={s} to={path(workspace.id, s)} className={cn(card, 'p-6')}><h2 className="font-semibold">{labels[s]}</h2><p className="mt-2 text-sm leading-6 text-gray-500">{descriptions[s]}</p><span className="mt-5 inline-flex items-center gap-1 text-xs font-semibold">Open<ChevronRight className="h-3 w-3" /></span></Link>)}</div>
          {workspace.id !== 'pocket' && <section className={cn(card, 'mt-6 p-6')}><h2 className="text-sm font-semibold">Connected integrations</h2><div className="mt-4 divide-y divide-gray-100 dark:divide-white/10">{workspace.integrations.map(p => <div key={p.id} className="flex flex-wrap justify-between gap-3 py-4 text-sm"><div><p>{p.name}</p><p className="mt-1 font-mono text-xs text-gray-400">{p.id}</p></div><span className="text-xs capitalize text-gray-500">{p.status}</span></div>)}</div></section>}
          <p className="mt-6 flex items-center gap-2 text-xs text-gray-500"><ShieldCheck className="h-4 w-4" />Access to operations does not grant escrow signing authority.</p>
        </>}
        {section === 'projects' && <ProjectOperations workspaceId={workspace.id} />}
        {section === 'agreements' && <><ArcAgreementOperationsPanel workspaceId={workspace.id} /><details className={cn(card, 'mt-6 p-5')}><summary className="cursor-pointer text-sm font-semibold">Activation settings <span className="ml-2 font-normal text-gray-500">{session.arcActivationEnabled ? 'Global switch enabled' : 'Global activation paused'}</span></summary><ProjectOperations workspaceId={workspace.id} mode="agreements" arcActivationEnabled={session.arcActivationEnabled} /></details></>}
        {section === 'trade-disputes' && <XStocksReviewOperationsPanel workspaceId={workspace.id} />}
        {section === 'support' && <PocketSupportOperationsPanel />}
        {section === 'transactions' && <PocketTransactionOperationsPanel />}
        {section === 'escalations' && <section className={cn(card, 'mt-7 max-w-3xl p-7')}><h2 className="font-semibold">Escalation connection not configured</h2><p className="mt-3 text-sm leading-7 text-gray-500">This product manages its own customer support. Its team will submit payment or escrow cases to Hash PayLink with the relevant evidence. That submission connection has not been built yet.</p><p className="mt-3 text-sm leading-7 text-gray-500">Existing agreement operations and Trade dispute review remain available in their sections. Customer inboxes are not connected here.</p></section>}
      </div>}
    </main>
  </div>
}

function SectionLink({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return <Link to={to} aria-current={active ? 'page' : undefined} className={cn('min-h-12 shrink-0 whitespace-nowrap border-b-2 py-4 text-xs font-medium', active ? 'border-gray-950 text-gray-950 dark:border-white dark:text-white' : 'border-transparent text-gray-500 hover:text-gray-950 dark:hover:text-white')}>{children}</Link>
}
