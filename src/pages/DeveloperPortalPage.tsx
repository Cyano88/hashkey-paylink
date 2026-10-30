import BankAccountName from '../developer/BankAccountName'
import EnablePocketWallets from '../developer/EnablePocketWallets'
import PersonalVerificationPanel from '../developer/PersonalVerificationPanel'
import PocketReceivingWallet from '../developer/PocketReceivingWallet'
import useDiscardChanges from '../developer/useDiscardChanges'
import ProfileSwitcher from '../developer/ProfileSwitcher'
import {PERSONAL_PROFILE,builderProfilesForProjects,projectBuilderProfileId,type BuilderProfile} from '../lib/builderProfiles'
import SandboxPanel from '../developer/SandboxPanel'
import {productionVerificationAllows} from '../lib/developerAccess'
import BuilderQuickstart from '../developer/BuilderQuickstart'
import ReceiptEmailSettings from '../developer/ReceiptEmailSettings'
import type{ReceiptEmailSettings as ReceiptEmailPreferences}from'../lib/receiptEmailSettings'
import BscCheckoutSettings from '../developer/BscCheckoutSettings'
import type {BscCheckoutConfig} from '../lib/bscCheckoutConfig'
import DeveloperLoadingSkeleton from '../components/DeveloperLoadingSkeleton'
import {CHECKOUT_NETWORK_ORDER} from '../lib/checkoutStablecoins'
import {acceptedCheckoutAssets,CHECKOUT_ACCEPTANCE,type CheckoutAcceptance} from '../lib/checkoutAcceptance'
import RemoveAppPanel from '../developer/RemoveAppPanel'
import AccountHome from '../developer/AccountHome'
import BusinessDirectory, {DirectoryProfile} from '../developer/BusinessDirectory'
import BusinessVerificationPanel from '../developer/BusinessVerificationPanel'
import type {BusinessVerification} from '../developer/verificationTypes'
import AccountMenu from '../developer/AccountMenu'
import AppsPanel from '../developer/AppsPanel'
import CreateProjectCard, { type CreateProjectForm } from '../developer/CreateProjectCard'
import ProductPicker from '../developer/ProductPicker'
import XLayerCheckoutSettings from '../developer/XLayerCheckoutSettings'
import type { XLayerCheckoutConfig } from '../lib/xlayerCheckoutConfig'
import {needsSettlementRouting, type ProductCapability} from '../lib/developerProducts'
import { isAgentCheckoutNetwork, developerProductNetworks } from '../lib/developerNetworkPolicy'
import PaymentActivityPanel from '../developer/PaymentListPanel'
import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CliGuide, OverviewPanel, ProductsPanel, portalSections, portalParent, portalSubsections, ComingSoonProducts, type PortalSection } from '../developer/PortalPanels'
import { usePrivy } from '@privy-io/react-auth'
import { BookOpen, Building2, BadgeCheck, Home, ArrowLeft, LayoutDashboard, CreditCard, Code2, Settings2, Bot, Check, ChevronRight, Copy, KeyRound, Loader2, Lock, LogOut, Plus, RotateCw, ShieldCheck, UserRound, Webhook } from 'lucide-react'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import PocketSelect from '../pocket/components/PocketSelect'
import { cn, copyToClipboard } from '../lib/utils'

type Network = 'base' | 'arbitrum' | 'arc' | 'ethereum' | 'polygon' | 'solana'
type Capability = ProductCapability
type CheckoutMode = 'human' | 'agentic'
type Project = {
  builderProfileId?: string
  accountType?: 'individual'|'business'
  personalKycVerified?: boolean
  productionAccess?: boolean
  removal?: {status:'closed'|'deleted';at:string}
  directoryProfile?: {enabled:boolean; introduction:string}
  businessVerification?: BusinessVerification
  acceptedAssets?: CheckoutAcceptance
  checkoutDefaultNetwork?: 'xlayer'|'bsc'
  bscCheckout?:BscCheckoutConfig
  xlayerCheckout?: XLayerCheckoutConfig
  id: string
  name: string
  ownerEmail: string
  website: string
  brandImageUrl: string
  receiptEmails?: ReceiptEmailPreferences
  useCase: string
  checkoutMode: CheckoutMode
  capabilities: Capability[]
  settlementMode: 'usdc' | 'ngn' | 'ugx'
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
  { key: 'arc', label: 'Arc', note: 'Mainnet' },
  { key: 'arbitrum', label: 'Arbitrum' },
  { key: 'solana', label: 'Solana' },
  { key: 'ethereum', label: 'Ethereum' },
  { key: 'polygon', label: 'Polygon' },
]

function editableProjectState(project:Project) {
  const fields:Array<keyof Project>=['name','website','brandImageUrl','receiptEmails','useCase','capabilities','settlementMode','networks','defaultNetwork','recipients','refundAddress','allowedOrigins','webhookUrl','acceptedAssets','checkoutDefaultNetwork','bankCode','bankAccountNumber','bankAccountName','bankName','xlayerCheckout','bscCheckout']
  return JSON.stringify(fields.map(field=>project[field]))
}

function fieldClass() {
  return 'h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm text-gray-950 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white dark:focus:border-blue-400/50 dark:focus:bg-white/[0.07]'
}

export default function DeveloperPortalPage() {
  const { ready, authenticated, getAccessToken, logout, user } = usePrivy()
  const institutionAccessToken = useRef(getAccessToken)
  institutionAccessToken.current = getAccessToken
  const loadGeneration = useRef(0)
  const creatingProject = useRef(false)
  const savingProject = useRef(false)
  const [receivingWallets, setReceivingWallets] = useState<Record<string,string>>({})
  const [allProjects, setProjects] = useState<Project[]>([])
  const [builderProfiles,setBuilderProfiles]=useState<BuilderProfile[]>([PERSONAL_PROFILE])
  const [authWaitExpired, setAuthWaitExpired] = useState(false)
  const [params, setParams] = useSearchParams()
  const [activeId, setActiveId] = useState(params.get('project') ?? '')
  const [loadFailed, setLoadFailed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [projectsOwner, setProjectsOwner] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [verificationDirty,setVerificationDirty]=useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const selectedTab = params.get('section')
  const tab: PortalSection = ['overview','products','activity','setup','verification','keys','webhooks','quickstart'].includes(selectedTab ?? '') ? selectedTab as PortalSection : 'overview'
  const sandbox = params.get('environment') === 'test' || (!params.has('environment') && !params.has('project') && !params.has('section'))
  const linkedProfileProject=allProjects.find(p=>p.id===params.get('project'))
  const activeProfileId=linkedProfileProject?projectBuilderProfileId(linkedProfileProject):params.get('profile')??(selectedTab&&!sandbox&&allProjects[0]?projectBuilderProfileId(allProjects[0]):'personal')
  const activeProfile=builderProfiles.find(p=>p.id===activeProfileId)??PERSONAL_PROFILE
  const projects=allProjects.filter(p=>projectBuilderProfileId(p)===activeProfile.id)
  const {confirmDiscard,discardDialog}=useDiscardChanges()
  function applyProfileChoice(id:string) {
    const next=allProjects.find(project=>projectBuilderProfileId(project)===id)
    setVerificationDirty(false);setDraft(next?{...next,recipients:{...next.recipients},networks:[...next.networks],allowedOrigins:[...next.allowedOrigins]}:null);setWebhookUrl(next?.webhookUrl??'');setNewKey(null);setNewWebhookSecret(null);setCreatingNew(false);setActiveId('');setError('');setNotice('')
    setParams({profile:id,environment:sandbox?'test':'live',section:'home'})
  }
  async function selectProfile(id:string) {
    if(busy||!builderProfiles.some(p=>p.id===id))return false
    if(id===activeProfile.id)return true
    if(hasUnsavedChanges()&&!await confirmDiscard())return false
    applyProfileChoice(id);return true
  }
  async function createBusinessProfile(name:string,profileId?:string) {
    if(busy)return
    if(hasUnsavedChanges()&&!await confirmDiscard())throw Error('Your current app changes have been kept.')
    const generation=loadGeneration.current
    setBusy(true)
    try{const data=await api('POST',{action:profileId?'setup-builder-profile':'create-builder-profile',name,profileId});if(generation!==loadGeneration.current)return
      if(!data.builderProfile)throw Error('Business profile could not be loaded.')
      loadGeneration.current+=1;setLoading(false)
      setBuilderProfiles(current=>[...current.filter(p=>p.id!==data.builderProfile!.id),data.builderProfile!]);applyProfileChoice(data.builderProfile.id)
    }finally{setBusy(false)}
  }
  async function switchEnvironment(production:boolean) {
    if (busy || (hasUnsavedChanges() && !await confirmDiscard())) return
    resetProjectDraft();setCreatingNew(false);setNewKey(null);setNewWebhookSecret(null);setError('');setNotice('')
    setParams({environment:production?'live':'test',section:'home',profile:activeProfile.id})
  }
  const accountView = selectedTab === 'home' || (!selectedTab && !params.get('project')) ? 'home' : selectedTab === 'businesses' ? 'businesses' : selectedTab === 'apps' ? 'apps' : null
  const showingApps = accountView === 'apps'
  function openApps() { openAccount('apps') }
  async function openAccount(section:'home'|'apps'|'businesses') {
    if (busy || (hasUnsavedChanges() && !await confirmDiscard())) return
    resetProjectDraft(); setCreatingNew(false); setNewKey(null); setNewWebhookSecret(null)
    setParams(current => { const next = new URLSearchParams(current); next.set('section', section); next.set('profile',activeProfile.id); next.delete('project'); return next })
  }
  function hasUnsavedChanges() { return Boolean((creatingNew && createForm.name.trim()) || (!sandbox && !accountView && !creatingNew && active && ((verificationDirty) || (tab==='setup' && draft?.id===active.id && editableProjectState(draft)!==editableProjectState(active)) || (tab==='webhooks' && webhookUrl !== (active.webhookUrl ?? ''))))) }
  function resetProjectDraft() { setVerificationDirty(false); if (active) { setDraft({...active, recipients:{...active.recipients}, networks:[...active.networks], allowedOrigins:[...active.allowedOrigins]}); setWebhookUrl(active.webhookUrl ?? '') } }
  async function startNewProject() {
    if (busy || (hasUnsavedChanges() && !await confirmDiscard())) return
    resetProjectDraft()
    setCreateForm({name:'',website:'',useCase:'',checkoutMode:'human',accountType:activeProfile.type,capabilities:['hosted_checkout']})
    setCreatingNew(true); setError(''); setNotice('')
  }
  async function setTab(value: PortalSection) {
    if (busy) return
    if (hasUnsavedChanges()) {
      if (!await confirmDiscard()) return
      resetProjectDraft()
    }
    setCreatingNew(false)
    setParams(current => { const next = new URLSearchParams(current); next.set('section', value); if(active) next.set('project',active.id); return next }) }
  async function selectProject(value: string, section:PortalSection='overview') {
    if (busy) return
    if (hasUnsavedChanges() && !await confirmDiscard()) return
    resetProjectDraft(); setNewKey(null); setNewWebhookSecret(null); setActiveId(value); setCreatingNew(false)
    setParams(current => { const next = new URLSearchParams(current); next.set('project', value); next.set('profile',activeProfile.id); next.set('section', projects.find(p=>p.id===value)?.removal?'activity':section); return next })
  }
  function appRemoved(mode:'closed'|'deleted') {
    setVerificationDirty(false);setDraft(null);setNewKey(null);setNewWebhookSecret(null);setCreatingNew(false)
    setProjects(current=>mode==='deleted'?current.filter(p=>p.id!==active?.id):current.map(p=>p.id===active?.id?{...p,removal:{status:'closed',at:new Date().toISOString()},operationalStatus:'suspended'}:p))
    setParams(current=>{const next=new URLSearchParams(current);next.set('section','apps');next.set('profile',activeProfile.id);next.delete('project');return next})
    setNotice(mode==='closed'?'App closed. Its payment history is retained.':'App deleted.');void loadProjects()
  }
  const [creatingNew, setCreatingNew] = useState(false)
  const [newKey, setNewKey] = useState<{ value: string; environment: 'test' | 'live'; projectId: string } | null>(null)
  const [newWebhookSecret, setNewWebhookSecret] = useState<{ value: string; projectId: string } | null>(null)
  const [webhookUrl, setWebhookUrl] = useState('')
  const [keyNames, setKeyNames] = useState({ test: 'Sandbox backend', live: 'Production backend' })
  const [createForm, setCreateForm] = useState<CreateProjectForm>({ name: '', website: '', useCase: '', checkoutMode: 'human', accountType: 'individual', capabilities: ['hosted_checkout'] })
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
      signal: AbortSignal.timeout(20000),
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    const data = await response.json().catch(() => undefined) as { ok?: boolean; projects?: Project[]; project?: Project; apiKey?: string; webhookSecret?: string; builderProfiles?:BuilderProfile[];builderProfile?:BuilderProfile;error?: string } | undefined
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
      setProjectsOwner(user?.id)
      setBuilderProfiles(data.builderProfiles??builderProfilesForProjects(next))
      setActiveId(current => current && next.some(project => project.id === current) ? current : next[0]?.id ?? '')
    } catch (reason) {
      if (generation !== loadGeneration.current) return
      setLoadFailed(true); setError(reason instanceof Error ? reason.message : 'Developer projects could not be loaded.')
    } finally {
      if (generation === loadGeneration.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!ready || !authenticated) { setBuilderProfiles([PERSONAL_PROFILE]);setProjects([]); setDraft(null); setNewKey(null); setNewWebhookSecret(null); return }
    void loadProjects()
    return () => { loadGeneration.current += 1 }
  }, [ready, authenticated, user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let cancelled=false
    setReceivingWallets({})
    if(ready && authenticated) void (async()=>{
      const token=await getAccessToken(); if(!token)return
      const response=await fetch('/api/developer-projects?resource=receiving-wallets',{headers:{authorization:`Bearer ${token}`},cache:'no-store'})
      const data=await response.json()
      if(!cancelled && response.ok && data.ok)setReceivingWallets(data.wallets ?? {})
    })().catch(()=>{})
    return ()=>{cancelled=true}
  },[ready,authenticated,user?.id])

  useEffect(() => { setDraft(active ? { ...active, recipients: { ...active.recipients }, networks: [...active.networks], allowedOrigins: [...active.allowedOrigins] } : null) }, [active?.id, active?.updatedAt])
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const content = document.getElementById('developer-content')
      content?.focus({preventScroll:true})
      if (window.matchMedia('(max-width: 1023px)').matches) content?.scrollIntoView({block:'start'})
    })
    return () => window.cancelAnimationFrame(frame)
  }, [tab, accountView, creatingNew, activeId])
  useEffect(() => { setWebhookUrl(active?.webhookUrl ?? '') }, [active?.id, active?.webhookUrl])
  useEffect(() => { const project = params.get('project'); if (project) { setNewKey(null); setNewWebhookSecret(null); setActiveId(project) } }, [params.get('project')])
  useEffect(() => { setVerificationDirty(false); setNewKey(null); setNewWebhookSecret(null); setError(''); setNotice('') }, [activeId, activeProfile.id])
  useEffect(() => { setCreatingNew(false) }, [activeProfile.id])
  useEffect(() => {
    if (!authenticated || !draft || draft.settlementMode === 'usdc') { setInstitutions([]); return }
    const currency = draft.settlementMode === 'ugx' ? 'UGX' : 'NGN'
    setInstitutions([])
    let cancelled = false
    setInstitutionsLoading(true)
    void institutionAccessToken.current().then(async token => {
      if (!token) throw new Error('Sign in again to load payout institutions.')
      const response = await fetch('/api/developer-projects?resource=institutions&currency='+currency, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' })
      const data = await response.json().catch(() => undefined) as { ok?: boolean; institutions?: Institution[]; error?: string } | undefined
      if (!response.ok || !data?.ok) throw new Error(data?.error || 'Payout institutions could not be loaded.')
      if (!cancelled) setInstitutions(data.institutions ?? [])
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Payout institutions could not be loaded.') })
      .finally(() => { if (!cancelled) setInstitutionsLoading(false) })
    return () => { cancelled = true }
  }, [authenticated, draft?.settlementMode, user?.id])

  async function createProject() {
    if (creatingProject.current) return
    creatingProject.current = true
    const generation = loadGeneration.current
    setBusy(true); setError('')
    try {
      const data = await api('POST', { action: 'create', ...createForm, checkoutMode: 'human', accountType:activeProfile.type, builderProfileId:activeProfile.id })
      if (generation !== loadGeneration.current) return
      if (!data.project) throw new Error('Project creation returned no project.')
      setProjects(current => [...current, data.project!])
      setActiveId(data.project.id)
      setParams(current => { const next = new URLSearchParams(current); next.set('project', data.project!.id); next.set('section','overview'); return next })
      setCreatingNew(false)
      setCreateForm({ name: '', website: '', useCase: '', checkoutMode: 'human', accountType: 'individual', capabilities: ['hosted_checkout'] })
      setNotice('Project created. Complete your settings to continue.')
    } catch (reason) { if (generation === loadGeneration.current) setError(reason instanceof Error ? reason.message : 'Project could not be created.') }
    finally { creatingProject.current = false; setBusy(false) }
  }

  async function saveProject(value = draft) {
    if (!value || savingProject.current) return
    savingProject.current=true
    const draft = value
    const generation = loadGeneration.current
    setBusy(true); setError(''); setNotice('')
    try {
      const data = await api('PUT', {
        action: 'configure', projectId: draft.id, name: draft.name, website: draft.website, brandImageUrl: draft.brandImageUrl, receiptEmails:draft.receiptEmails, useCase: draft.useCase,
        checkoutMode: draft.checkoutMode, capabilities: draft.capabilities,
        bscCheckout: draft.checkoutMode==='human'&&draft.capabilities.includes('hosted_checkout')&&draft.settlementMode==='usdc'?draft.bscCheckout??null:null,
        xlayerCheckout: draft.checkoutMode === 'human' && draft.capabilities.includes('hosted_checkout') && draft.settlementMode === 'usdc' ? draft.xlayerCheckout ?? null : null,
        acceptedAssets:draft.acceptedAssets,checkoutDefaultNetwork:draft.checkoutDefaultNetwork,settlementMode: draft.settlementMode, networks: draft.networks, defaultNetwork: draft.defaultNetwork,
        arcMainnetChainId: draft.networks.includes('arc') ? 5042 : undefined, recipients: draft.recipients, refundAddress: draft.refundAddress, allowedOrigins: draft.allowedOrigins.length ? draft.allowedOrigins : [draft.website],
        webhookUrl: draft.webhookUrl, bankCode: draft.bankCode, bankName: draft.bankName,
        bankAccountName: draft.bankAccountName, bankAccountNumber: draft.bankAccountNumber ?? '',
      })
      if (generation !== loadGeneration.current) return
      if (!data.project) throw new Error('Project update returned no project.')
      setProjects(current => current.map(project => project.id === data.project!.id ? data.project! : project))
      setDraft({ ...data.project, recipients: {...data.project.recipients}, networks: [...data.project.networks], allowedOrigins: [...data.project.allowedOrigins] })
      setWebhookUrl(data.project.webhookUrl)
      setNotice(data.project.operationalStatus === 'suspended'
        ? 'Configuration saved. The project remains suspended.'
        : data.project.settlementStatus === 'ready' ? 'Project settings saved.' : 'Configuration saved. Setup is still required.')
    } catch (reason) { if(generation===loadGeneration.current)setError(reason instanceof Error && reason.name==='TimeoutError' ? 'Saving took longer than expected. Reload to check whether your changes were saved.' : reason instanceof Error ? reason.message : 'Configuration could not be saved.') }
    finally { savingProject.current=false;setBusy(false) }
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
            <h2 className="mt-5 text-2xl font-semibold leading-[1.3] tracking-normal text-gray-950 dark:text-white">{params.get('continueOnPhone')==='1'?'Continue verification':'Build with Hash PayLink'}</h2>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{params.get('continueOnPhone')==='1'?'Sign in with the same account you used on your computer to continue your identity check.':'Sign in to configure your products, connect your backend and track project events.'}</p>
            <div className="mt-7"><PocketEmailLogin context="developer" /></div>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-gray-400"><Lock className="h-3 w-3" /> Keep API keys on your backend.</p>
          </div>
        </section>
      </main>
    )
  }

  if (loading && !projects.length) return <PortalLoading />

  if (loadFailed && !projects.length && params.get('continueOnPhone') !== '1') return <main className="mx-auto max-w-xl px-4 py-16"><h1 className="text-2xl font-semibold">Projects could not be loaded</h1><Message tone="error">{error}</Message><button type="button" disabled={loading} onClick={() => void loadProjects()} className="developer-primary mt-6">Try again</button></main>

  // A phone continuation must never fall back to another app or previous account's data.
  if (params.get('continueOnPhone') === '1' && tab === 'verification') {
    if (loadFailed) return <main className="mx-auto max-w-xl px-4 py-16"><h1 className="text-2xl font-semibold">Verification could not load</h1><p className="mt-3 text-sm text-gray-500">We could not check this link. Please try again.</p><button type="button" onClick={()=>void loadProjects()} className="developer-primary mt-6">Try again</button></main>
    if (loading || projectsOwner !== user?.id) return <PortalLoading />
    const requested = allProjects.find(project => project.id === params.get('project'))
    if (!requested || requested.removal || requested.accountType !== 'individual') return <main className="mx-auto max-w-xl px-4 py-16"><h1 className="text-2xl font-semibold">Check your account or verification link</h1><p className="mt-3 text-sm leading-6 text-gray-500">Use the same account as on your computer. If you are already using it, open Personal verification there and create a new phone link.</p><button type="button" onClick={()=>void logout()} className="developer-primary mt-6">Change account</button><Link to="/" className="mt-4 block text-sm font-semibold">Back to dashboard</Link></main>
  }

  const parent = portalParent(tab)
  const subnav = portalSubsections[parent]
  const sectionIcons = { activity: CreditCard, overview: LayoutDashboard, products: CreditCard, quickstart: Code2, setup: Settings2 }
  return (
    <main className="portal-console min-h-[calc(100dvh-4rem)] w-full lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <aside className="flex flex-col border-b border-gray-200 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#101114] lg:sticky lg:top-0 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-5 lg:py-7">
        {sandbox && <nav aria-label="Sandbox navigation" className="account-navigation"><a href="#developer-content" aria-current="page"><Home size={17}/>Sandbox</a><a href="https://docs.hashpaylink.com/docs/getting-started" target="_blank" rel="noopener noreferrer"><BookOpen size={17}/>Docs</a></nav>}
        {!sandbox && <>
        <nav aria-label="Account navigation" className="account-navigation">
          <button disabled={busy} onClick={()=>openAccount('home')} aria-current={accountView==='home'&&!creatingNew?'page':undefined}><Home size={17}/>Home</button>
          <div className="flex items-center"><button disabled={busy} onClick={openApps} aria-current={showingApps&&!creatingNew?'page':undefined} className="flex-1"><LayoutDashboard size={17}/>Apps</button><button aria-label="New app" title="New app" disabled={busy||sandbox} onClick={startNewProject}><Plus size={17}/></button></div>
          <a href="https://docs.hashpaylink.com" target="_blank" rel="noopener noreferrer"><BookOpen size={17}/>Docs</a>
          <button disabled={busy} onClick={()=>openAccount('businesses')} aria-current={accountView==='businesses'&&!creatingNew?'page':undefined}><BadgeCheck size={17} className="fill-blue-500 text-white"/>Verified businesses</button>
        </nav>
        {!accountView && !creatingNew && active && <><p className="mt-5 truncate px-3 text-xs font-medium text-gray-400">{active.name}</p>
        <nav aria-label="Project navigation" className="mt-4 grid grid-cols-4 gap-1 lg:mt-8 lg:grid-cols-1 lg:gap-2">
          {(active.removal?[['activity','Payments']] as Array<[PortalSection,string]>:portalSections).map(([value,label]) => { const Icon=sectionIcons[value as keyof typeof sectionIcons]; return <button key={value} type="button" disabled={busy} aria-current={parent===portalParent(value)&&!creatingNew?'page':undefined} onClick={()=>setTab(value)} className={cn('flex min-h-11 items-center justify-center gap-3 rounded-lg px-2 text-xs font-medium transition lg:justify-start lg:px-3 lg:text-sm',parent===portalParent(value)&&!creatingNew?'bg-gray-100 text-gray-950 dark:bg-white/10 dark:text-white':'text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5')}><Icon className="hidden h-4 w-4 lg:block"/>{label}</button>})}
        </nav></>}
        </>}
        <div className="mt-6 border-t border-gray-200 pt-4 dark:border-white/10 lg:mt-auto lg:pt-5">
          <button type="button" role="switch" aria-label="Production" aria-checked={!sandbox} disabled={busy} onClick={()=>switchEnvironment(sandbox)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 text-sm font-medium">
            <span>Production</span><span aria-hidden="true" className={cn('flex h-6 w-10 items-center rounded-full p-1 transition',sandbox?'bg-gray-300 dark:bg-gray-700':'bg-blue-600')}><span className={cn('h-4 w-4 rounded-full bg-white shadow-sm transition-transform',!sandbox&&'translate-x-4')}/></span>
          </button><p className="mt-1 px-3 text-xs text-gray-500">{sandbox?'Sandbox · No real money':'Production · Real payments'}</p>
        </div>
      </aside>
      <div className="min-w-0 px-5 py-7 sm:px-9 sm:py-10 lg:px-12">
        <div className="mb-6 flex items-center justify-between gap-4">{!accountView && !creatingNew && active && <button type="button" onClick={openApps} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-medium text-gray-500 transition hover:text-gray-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:text-white"><ArrowLeft size={16}/>Back to apps</button>}<div className="ml-auto"><AccountMenu onLogout={logout} profileSwitcher={<ProfileSwitcher profiles={builderProfiles} active={activeProfile} disabled={busy} onSelect={selectProfile} onCreate={createBusinessProfile}/>}/></div></div>
        {!sandbox && !accountView && !creatingNew && !active?.removal && subnav && <nav aria-label={parent==='products'?'Payments navigation':'Developer tools'} className="mb-8 flex gap-6 overflow-x-auto border-b border-gray-200 dark:border-white/10">{subnav.map(([value,label])=><button key={value} type="button" disabled={busy} onClick={()=>setTab(value)} aria-current={tab===value?'page':undefined} className={cn('min-h-11 shrink-0 border-b-2 px-1 text-sm font-medium',tab===value?'border-gray-950 text-gray-950 dark:border-white dark:text-white':'border-transparent text-gray-500')}>{label}</button>)}</nav>}
        <p className="mb-4 flex items-center gap-2 text-xs font-medium text-gray-500">{activeProfile.type==='business'?<Building2 size={14}/>:<UserRound size={14}/>}<span>{activeProfile.type==='business'?activeProfile.name+' \u00b7 Business':'Personal profile'}</span></p>
        <section id="developer-content" tabIndex={-1} className={cn("min-w-0 outline-none",accountView==='home'?'max-w-[1120px]':'max-w-4xl')}>
          {sandbox ? <SandboxPanel key={(user?.id??'')+':'+activeProfile.id} profileId={activeProfile.id}/> : creatingNew
            ? <CreateProjectCard profileName={activeProfile.name} form={createForm} setForm={setCreateForm} busy={busy} error={error} onCreate={createProject} onCancel={async () => {if(!hasUnsavedChanges() || await confirmDiscard())setCreatingNew(false)}} embedded />
            : accountView==='home' ? <AccountHome key={activeProfile.id} apps={projects} onOpen={selectProject} onCreate={startNewProject} onApps={openApps}/> : accountView==='businesses' ? <BusinessDirectory/> : showingApps || !projects.length ? <AppsPanel apps={projects} onOpen={selectProject} onCreate={startNewProject} disabled={busy}/> : active?.removal ? <><h1 className="text-2xl font-semibold">{active.name}</h1><p className="mb-8 mt-2 text-sm text-gray-500">Closed app. Payment history is retained for your records.</p><PaymentActivityPanel key={active.id} projectId={active.id}/></> : <>
              {active && tab === 'overview' && <OverviewPanel project={active} onNavigate={setTab} />}
              {active && tab === 'products' && <ProductsPanel project={active} onConfigure={() => setTab('setup')} />}
              {active && tab === 'activity' && <PaymentActivityPanel key={active.id} projectId={active.id} />}
              {active && draft && tab === 'setup' && <><SetupPanel onWalletsReady={setReceivingWallets} onWalletBusy={setBusy} error={error} notice={notice} receivingWallets={receivingWallets} draft={draft} setDraft={setDraft} institutions={institutions} institutionsLoading={institutionsLoading} busy={busy} onSave={() => void saveProject()} /><DirectoryProfile key={active.id} projectId={active.id} profile={active.directoryProfile} appDirty={editableProjectState(draft)!==editableProjectState(active)} onDirty={setVerificationDirty} onBusy={setBusy} onChanged={()=>void loadProjects()}/><RemoveAppPanel key={active.id+':remove'} projectId={active.id} name={active.name} dirty={hasUnsavedChanges()} onBusy={setBusy} onRemoved={appRemoved}/></>}
              {active && tab === 'verification' && (active.accountType === 'individual' ? <PersonalVerificationPanel /> : <BusinessVerificationPanel key={active.id} projectId={active.id} onDirty={setVerificationDirty} onBusy={setBusy} onChanged={()=>void loadProjects()}/>) }
              {active && tab === 'keys' && <KeysPanel project={active} keyNames={keyNames} setKeyNames={setKeyNames} newKey={newKey?.projectId === active.id ? newKey : null} busy={busy} onCreate={createKey} onRevoke={revokeKey} />}
              {active && draft && tab === 'webhooks' && <WebhookPanel draft={{ ...active, webhookUrl }} setDraft={value => setWebhookUrl(value.webhookUrl)} newSecret={newWebhookSecret?.projectId === active.id ? newWebhookSecret.value : ''} busy={busy} onSave={() => void saveProject({ ...active, webhookUrl })} onRotate={rotateWebhookSecret} savedUrl={active.webhookUrl} />}
              {active && tab === 'quickstart' && <><QuickstartPanel project={active} /><details className="mt-8 border-t border-gray-200 pt-5 dark:border-white/10"><summary className="cursor-pointer text-sm font-medium">Command-line tools</summary><CliGuide projectId={active.id} /></details><details className="mt-6 text-sm text-gray-500"><summary className="cursor-pointer">Coming soon</summary><ComingSoonProducts/></details></>}
            </>}
          {!creatingNew && tab !== 'setup' && error && <Message tone="error">{error}</Message>}
          {tab !== 'setup' && notice && <Message tone="success">{notice}</Message>}
        </section>
      </div>
      {discardDialog}
    </main>
  )
}

function CapabilityPicker({ checkoutMode, value, onChange }: { checkoutMode: CheckoutMode; value: Capability[]; onChange: (value: Capability[]) => void }) {
  return <ProductPicker mode={checkoutMode} value={value} onChange={onChange}/>
}

function SetupPanel({ onWalletsReady, onWalletBusy, receivingWallets, draft, setDraft, institutions, institutionsLoading, busy, onSave, error, notice }: { onWalletsReady:(wallets:Record<string,string>)=>void; onWalletBusy:(busy:boolean)=>void; receivingWallets: Record<string,string>; draft: Project; setDraft: (project: Project) => void; institutions: Institution[]; institutionsLoading: boolean; busy: boolean; onSave: () => void; error?:string; notice?:string }) {
  const [settingsSection, setSettingsSection] = useState<'general'|'receiving'|'branding'|'receipts'>('general')
  const [settingsError, setSettingsError] = useState('')

  function submitSettings() {
    let message = ''
    if (draft.name.trim().length < 2) message = 'Enter your project name.'
    try { if (new URL(draft.website).protocol !== 'https:') throw new Error() } catch { message = 'Enter your website starting with https://.' }
    if (!message && draft.useCase.trim().length < 20) message = 'Describe your business in at least 20 characters.'
    setSettingsError(message)
    if (message) { setSettingsSection('general'); return }
    if (settingsSection === 'general' && draft.settlementStatus !== 'ready') setSettingsSection('receiving')
    else onSave()
  }
  const bankAccountNumber = draft.bankAccountNumber ?? ''
  const localSettlement = draft.settlementMode !== 'usdc'
  const mobileMoney = draft.settlementMode === 'ugx'
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
    setDraft({ ...draft, networks, recipients: draft.recipients, defaultNetwork: networks.includes(draft.defaultNetwork) ? draft.defaultNetwork : networks[0] })
  }
  return <fieldset disabled={busy} className="min-w-0">
    {draft.checkoutMode === 'agentic' && draft.networks.some(network => !isAgentCheckoutNetwork(network)) && <div role="alert" className="mb-4 rounded-xl border border-amber-300 p-4 text-sm">Agent checkout now supports Base and Arc only. Remove unsupported routes, then save your settings. <button type="button" className="ml-2 underline" onClick={() => { const networks = draft.networks.filter(isAgentCheckoutNetwork); if (!networks.length) networks.push('base'); setDraft({ ...draft, networks, defaultNetwork: networks.includes(draft.defaultNetwork as 'base' | 'arc') ? draft.defaultNetwork : networks[0] }) }}>Remove unsupported networks</button></div>}
    {unsupportedNetworks && <div role="alert" className="mb-4 rounded-xl border border-amber-300 p-4 text-sm">Some saved networks do not support the selected products. <button type="button" className="ml-2 underline" onClick={() => updateProducts(draft.capabilities)}>Use supported networks</button></div>}
    <PanelHeader eyebrow="Project" title="Settings" copy="Your business details and receiving accounts." status={draft.operationalStatus === 'suspended' ? 'Suspended' : draft.settlementStatus === 'ready' ? 'Configured' : 'Setup required'} />
    <nav aria-label="Settings sections" className="mt-6 flex gap-5 overflow-x-auto whitespace-nowrap border-b border-gray-200 dark:border-white/10">{(['general','receiving','branding','receipts'] as const).map(value=><button key={value} type="button" onClick={()=>setSettingsSection(value)} aria-current={settingsSection===value?'page':undefined} className={cn('min-h-11 border-b-2 text-sm',settingsSection===value?'border-gray-950 font-semibold dark:border-white':'border-transparent text-gray-500')}>{value==='general'?'Business details':value==='receiving'?'Receiving accounts':value==='branding'?'Branding':'Receipts & support'}</button>)}</nav>
    <div hidden={settingsSection!=='general'}>
    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <Field label="Project name"><input className={fieldClass()} value={draft.name} onChange={event => setDraft({ ...draft, name: event.target.value })} /></Field>
      <Field label="Website"><input className={fieldClass()} value={draft.website} onChange={event => setDraft({ ...draft, website: event.target.value })} /></Field>
    </div>
    <Field label="What customers pay for" className="mt-4"><textarea className={cn(fieldClass(), 'h-24 resize-none py-3')} value={draft.useCase} onChange={event => setDraft({ ...draft, useCase: event.target.value })} /></Field>
    <CapabilityPicker checkoutMode={draft.checkoutMode} value={draft.capabilities} onChange={updateProducts} />

    <details className="mt-6 border-t border-gray-200 pt-4 dark:border-white/10"><summary className="cursor-pointer text-sm font-medium">Advanced settings</summary>
      <ProjectIdCard value={draft.id}/>
      <Field label="Allowed return origin" className="mt-4"><input className={fieldClass()} value={draft.allowedOrigins[0] ?? draft.website} onChange={event=>setDraft({...draft,allowedOrigins:[event.target.value]})} placeholder="https://yourapp.com"/></Field>
    </details></div>
    <div hidden={settingsSection!=='branding'}>
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
          <p className="mt-1 text-sm leading-5 text-gray-500 dark:text-gray-400">Use a square 512 × 512 PNG or WebP with space around your logo. JPG is also accepted. It appears on checkout, receipts and Pocket activity, including at small sizes. Use a public HTTPS URL on the same origin as your website. If the image cannot load, Pocket shows your business’s first letter.</p>
        </div>
      </div>
      <Field label="Brand mark URL" className="mt-3"><input className={fieldClass()} value={draft.brandImageUrl} onChange={event => setDraft({ ...draft, brandImageUrl: event.target.value })} placeholder="https://yourplatform.com/brand/mark.png" /></Field>
    </div>

    </div>
    <div hidden={settingsSection!=='receipts'}><ReceiptEmailSettings value={draft.receiptEmails} onChange={receiptEmails=>setDraft({...draft,receiptEmails})} eligible={draft.checkoutMode==='human'&&draft.capabilities.includes('hosted_checkout')&&draft.settlementMode==='usdc'&&Boolean(draft.xlayerCheckout)}/></div>
    <div hidden={settingsSection!=='receiving'}>
    {settingsSection==='receiving' && draft.settlementMode==='usdc' && <EnablePocketWallets wallets={receivingWallets} onReady={onWalletsReady} onBusy={onWalletBusy}/>}
    {routingRequired && <><div className="mt-7">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{localSettlement ? 'Checkout settlement' : 'Receive payments as'}</p>
      {draft.checkoutMode === 'agentic' || !draft.capabilities.includes('hosted_checkout')
        ? <div className="mt-2 rounded-xl bg-gray-100 px-3 py-3 text-xs font-semibold text-gray-700 dark:bg-white/[0.05] dark:text-gray-200">Receive USDC</div>
        : <div className="mt-2 grid grid-cols-1 gap-2 rounded-2xl bg-gray-100 p-1 sm:grid-cols-3 dark:bg-white/[0.05]">
          {[['usdc', 'Stablecoins'], ['ngn', 'Nigeria bank'], ['ugx', 'Uganda mobile money']] .map(([value, label]) => <button key={value} type="button" onClick={() => {if(value===draft.settlementMode)return;setDraft({ ...draft, settlementMode: value as Project['settlementMode'], bankCode:'',bankName:'',bankAccountName:'',bankAccountNumber:'',bankAccountLast4:'',bankVerifiedAt:undefined, ...(value !== 'usdc' ? { networks: ['base'], defaultNetwork: 'base', recipients: {}, xlayerCheckout:undefined,bscCheckout:undefined,checkoutDefaultNetwork:undefined } : {}) })}} className={cn('rounded-xl px-3 py-2.5 text-xs font-semibold transition', draft.settlementMode === value ? 'bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>{label}</button>)}
        </div>}


    {localSettlement && <p className="mt-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800 dark:border-blue-400/20 dark:bg-blue-400/10 dark:text-blue-200">Customers pay USDC on Base. {mobileMoney ? 'You receive UGX in your configured MTN or Airtel mobile money account.' : 'You receive NGN in your configured Nigerian bank account.'} Delivery is confirmed before checkout is marked paid.</p>}
    </div>

    <div className="mt-7">
      <p className="text-xs font-semibold text-gray-600 dark:text-gray-300">{agreementOnly ? 'Arc agreement settlement' : 'Settlement networks'}</p>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NETWORKS.filter(network => supportedNetworks.includes(network.key)).map(network => {
          const active = draft.networks.includes(network.key)
          const disabled = network.disabled || (localSettlement && network.key !== 'base')
          return <button key={network.key} type="button" disabled={disabled} onClick={() => toggleNetwork(network.key)} className={cn('flex min-h-12 items-center justify-center gap-1.5 rounded-xl border px-2 text-xs font-semibold transition', active ? 'border-blue-500 bg-blue-50 text-blue-700 ring-2 ring-blue-500/10 dark:bg-blue-400/15 dark:text-blue-200' : 'border-gray-200 text-gray-500 hover:border-blue-300 hover:bg-blue-50/60 dark:border-white/10 dark:text-gray-400 dark:hover:bg-blue-400/10', disabled && 'cursor-not-allowed opacity-45')}>{network.label}{network.note && <span className="text-xs font-black uppercase opacity-70">{network.note}</span>}</button>
        })}
      </div>
    </div>

    {draft.capabilities.includes('arc_agreements') && <p className="mt-3 text-sm leading-6 text-gray-500">Arc agreements use USDC on Arc Mainnet.{draft.checkoutMode === 'human' && ' X Layer agreements and Swap use the networks selected in their own sections above.'}</p>}
    <div className="mt-5 space-y-3">
      {draft.settlementMode === 'usdc' && NETWORKS.filter(option=>draft.networks.includes(option.key)&&supportedNetworks.includes(option.key)).map(({key:network}) => <section key={network} className="rounded-2xl border border-gray-200 p-4 dark:border-white/10"><h3 className="mb-3 text-sm font-semibold">{network === 'arc' ? 'Arc' : network[0].toUpperCase() + network.slice(1)}</h3><p className="mb-2 text-xs text-gray-500">Accepted stablecoins</p>
        <div className="mb-3 flex flex-wrap gap-2">{CHECKOUT_ACCEPTANCE[network].map(asset=>{const selected=acceptedCheckoutAssets(network,draft.acceptedAssets),checked=selected.includes(asset);return <label key={asset} className="flex min-h-10 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm dark:border-white/10"><input type="checkbox" aria-label={'Accept '+asset+' on '+network} checked={checked} disabled={checked&&selected.length===1} onChange={()=>setDraft({...draft,acceptedAssets:{...draft.acceptedAssets,[network]:checked?selected.filter(value=>value!==asset):[...selected,asset]}})}/>{asset}</label>})}</div>
        <Field label={`${network === 'arc' ? 'Arc' : network[0].toUpperCase() + network.slice(1)} receiving address`}><input className={fieldClass()} value={draft.recipients[network] ?? ''} onChange={event => setDraft({ ...draft, recipients: { ...draft.recipients, [network]: event.target.value } })} placeholder={network === 'solana' ? 'Solana wallet address' : '0x...'} /></Field>
      <PocketReceivingWallet network={network} address={receivingWallets[network]} selected={draft.recipients[network]} business={draft.accountType!=='individual'} onSelect={()=>setDraft({...draft,recipients:{...draft.recipients,[network]:receivingWallets[network]}})}/>
      </section>)}
      {draft.settlementMode === 'usdc' && <p className="text-xs leading-5 text-gray-500 dark:text-gray-400">{draft.capabilities.includes('arc_agreements') ? 'The Arc address is the fixed project recipient for Agreements. Paying different workers or sellers requires the backend verified-recipient integration; do not substitute a platform wallet for their payout wallets. This is not an escrow deposit address.' : 'Choose accepted stablecoins and add your receiving wallet for each network.'}</p>}
    </div>


    </>}
    {!routingRequired && <p className="mt-5 rounded-xl bg-gray-50 p-4 text-sm leading-6 text-gray-500 dark:bg-white/5">No project receiving address is needed for these products. Swaps use the connected user wallet; X Layer agreement recipients and eligible stock assets are bound to each agreement.</p>}
    {draft.checkoutMode === 'human' && draft.capabilities.includes('hosted_checkout') && draft.settlementMode === 'usdc' && <XLayerCheckoutSettings defaultRecipient={receivingWallets.xlayer} business={draft.accountType!=='individual'} value={draft.xlayerCheckout} onChange={xlayerCheckout => setDraft({ ...draft, xlayerCheckout,...(!xlayerCheckout&&draft.checkoutDefaultNetwork==='xlayer'?{checkoutDefaultNetwork:undefined}:{}) })} />}

{draft.checkoutMode==='human'&&draft.capabilities.includes('hosted_checkout')&&draft.settlementMode==='usdc'&&<BscCheckoutSettings defaultRecipient={receivingWallets.bsc} business={draft.accountType!=='individual'} value={draft.bscCheckout} onChange={bscCheckout=>setDraft({...draft,bscCheckout,...(!bscCheckout&&draft.checkoutDefaultNetwork==='bsc'?{checkoutDefaultNetwork:undefined}:{})})}/>}
{routingRequired && draft.settlementMode === 'usdc' && <Field label="Default network" className="mt-4"><PocketSelect showNetworkBalances={false} value={draft.checkoutDefaultNetwork==='bsc'&&draft.bscCheckout?'bsc':draft.checkoutDefaultNetwork === 'xlayer' && draft.xlayerCheckout ? 'xlayer' : draft.defaultNetwork} options={[...draft.networks.filter(network => supportedNetworks.includes(network)).map(network => ({ value: network, label: network === 'arc' ? 'Arc' : network[0].toUpperCase() + network.slice(1) })),...(draft.xlayerCheckout?[{value:'xlayer',label:'X Layer'}]:[]),...(draft.bscCheckout?[{value:'bsc',label:'BNB Chain'}]:[])].sort((a,b)=>CHECKOUT_NETWORK_ORDER.indexOf(a.value as typeof CHECKOUT_NETWORK_ORDER[number])-CHECKOUT_NETWORK_ORDER.indexOf(b.value as typeof CHECKOUT_NETWORK_ORDER[number]))} onChange={value => setDraft({ ...draft, checkoutDefaultNetwork:value==='xlayer'?'xlayer':value==='bsc'?'bsc':undefined,...(!['xlayer','bsc'].includes(value)?{defaultNetwork:value as Network}:{}) })} ariaLabel="Default payment network" /></Field>}

    {localSettlement && <div className="mt-6 grid gap-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.03] sm:grid-cols-2">
      <Field label={mobileMoney ? "Mobile money provider" : "Bank"} className="sm:col-span-2"><PocketSelect value={draft.bankCode} options={institutions.map(bank => ({ value: bank.code, label: bank.name }))} onChange={value => { const bank = institutions.find(item => item.code === value); setDraft({ ...draft, bankCode: value, bankName: bank?.name ?? '', bankAccountNumber: '', bankAccountName: '', bankVerifiedAt: undefined }) }} disabled={institutionsLoading} placeholder={institutionsLoading ? 'Loading...' : mobileMoney ? 'Select provider' : 'Select bank'} ariaLabel={mobileMoney ? 'Uganda mobile money provider' : 'Naira settlement bank'} /></Field>
      <Field label={mobileMoney ? "Mobile money number" : "Account number"}><input className={fieldClass()} inputMode="numeric" value={bankAccountNumber} onChange={event => setDraft({ ...draft, bankAccountNumber: mobileMoney ? event.target.value : event.target.value.replace(/\D/g,'').slice(0,10), bankAccountName: '', bankVerifiedAt: undefined })} placeholder={draft.bankAccountLast4 ? `••••••${draft.bankAccountLast4}` : mobileMoney ? '2567XXXXXXXX' : '10-digit account'} /></Field>
      {mobileMoney ? <Field label="Registered account name"><input className={fieldClass()} value={draft.bankAccountName} readOnly={Boolean(draft.bankVerifiedAt && !bankAccountNumber)} onChange={event => setDraft({ ...draft, bankAccountName: event.target.value, bankVerifiedAt: undefined })} placeholder="Name registered with the provider" /></Field> : <BankAccountName projectId={draft.id} bankCode={draft.bankCode} accountNumber={bankAccountNumber} savedName={draft.bankVerifiedAt ? draft.bankAccountName : ''} />}
      <Field label="Base USDC refund address" className="sm:col-span-2"><input className={fieldClass()} value={draft.refundAddress} onChange={event => setDraft({ ...draft, refundAddress: event.target.value })} placeholder="0x..." /></Field>
      {draft.bankVerifiedAt && <p className="sm:col-span-2 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-300"><ShieldCheck className="h-4 w-4" /> Payout details checked</p>}
    </div>}
    </div>
    {settingsError && <p role="alert" className="mt-4 text-sm text-red-600">{settingsError}</p>}
    {error && <Message tone="error">{error}</Message>}
    {notice && <Message tone="success">{notice}</Message>}
    <button type="button" disabled={busy} onClick={submitSettings} className="mt-7 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gray-950 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:opacity-50 dark:bg-white dark:text-gray-950">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {settingsSection==='general'&&draft.settlementStatus!=='ready'?'Continue to receiving accounts':'Save changes'}</button>
  </fieldset>
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
        <button type="button" disabled={environment === 'test' || !productionVerificationAllows(project) || !needsSettlementRouting(project.capabilities) || busy || project.settlementStatus !== 'ready' || project.operationalStatus === 'suspended' || !keyNames[environment].trim()} onClick={() => onCreate(environment)} className="flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-gray-950 px-4 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-gray-950"><Plus className="h-4 w-4" /> Create API key</button>
      </div>
      <div className="mt-4 space-y-2">{keys.length ? keys.map(key => <div key={key.id} className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-3 dark:bg-white/[0.04]"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-gray-600 shadow-sm dark:bg-white/[0.06] dark:text-gray-300"><KeyRound className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900 dark:text-white">{key.name}</p><p className="mt-0.5 font-mono text-xs text-gray-400">{key.prefix}••••</p>{key.scopes && <p className="mt-1 text-xs text-gray-500">Scoped backend key · {key.expiresAt && Date.parse(key.expiresAt) <= Date.now() ? 'Expired' : 'Expires ' + new Date(key.expiresAt!).toLocaleDateString()}</p>}</div>{key.revokedAt ? <span className="text-xs font-semibold text-gray-400">Revoked</span> : <button type="button" disabled={busy} onClick={() => onRevoke(key.id)} className="text-xs font-semibold text-red-500">Revoke</button>}</div>) : <EmptyState icon={KeyRound} text={`No ${environment} keys yet.`} />}</div>
    </section>
  }

  return <div>{!productionVerificationAllows(project) && <p className="mb-5 text-sm text-gray-500">Complete the verification required for this payment option in Settings.</p>}<PanelHeader eyebrow="Credentials" title="API keys" copy="Keys authenticate your backend for this project. Keep their values in your server secret manager." />

    {project.settlementStatus !== 'ready' && <p className="mt-5 text-xs text-amber-600 dark:text-amber-300">Complete and save the active settlement configuration before creating a key.</p>}
    {project.operationalStatus === 'suspended' && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200">This project is suspended. {project.suspensionReason || 'Contact Hash PayLink operations before creating new credentials.'}</p>}
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      {project.keys.some(key => key.environment === 'test') && environmentSection('test', 'Existing test keys', `These legacy test keys cannot execute payments. Create simulation keys in Sandbox. Project mode: ${project.checkoutMode === 'agentic' ? 'agentic x402' : 'human checkout'}.`)}
      {environmentSection('live', 'Live keys', `Use a secret key to connect your server. Never expose it in your app.`)}
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
  if(project.checkoutMode==='human' && project.settlementMode==='usdc' && project.capabilities.includes('hosted_checkout'))return <BuilderQuickstart returnOrigin={project.allowedOrigins[0]||project.website||'https://shop.example'} hasFunding={project.capabilities.includes('polymarket_funding')}/>
  const paymentPath = project.checkoutMode
  const hasCheckout = project.capabilities.includes('hosted_checkout')
  const hasAgreements = project.capabilities.includes('arc_agreements')
  const hasFunding = project.capabilities.includes('polymarket_funding')
  const fundingCode = `const response = await fetch("https://developer.hashpaylink.com/api/v2/funding/polymarket/checkouts", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Content-Type": "application/json",\n    "Idempotency-Key": "funding_order_0001"\n  },\n  body: JSON.stringify({\n    polymarketWallet: customer.polymarketWallet,\n    amount: "10",\n    returnUrl: "${project.allowedOrigins[0] ?? project.website}/complete"\n  })\n});\nif (!response.ok) throw new Error("Funding request failed");\nconst funding = await response.json();\n// Read the funding status API; payment confirmation is not bridge completion.`
  const modeFields = `    checkoutMode: "${paymentPath}",${paymentPath === 'agentic' ? '\n    agenticType: "agent_treasury",\n    network: process.env.HASH_PAYLINK_NETWORK,' : project.settlementMode === 'usdc' ? '\n    paymentSelection: "stablecoins",' : ''}`
  const createCode = `const checkout = await fetch("https://app.hashpaylink.com/api/v2/checkouts", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Idempotency-Key": order.id,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    kind: "service",\n${modeFields}\n    title: "Premium plan",\n    amount: "10",\n    returnUrl: "${project.allowedOrigins[0] ?? project.website}/complete"\n  })\n}).then(res => res.json());`
  const checkoutCode = paymentPath === 'human'
    ? `${createCode}\n\n// Send a person to Hash PayLink's hosted checkout.\nwindow.location.assign(new URL(checkout.checkoutUrl, "https://app.hashpaylink.com"));`
    : `${createCode}\n\n// Send an agent-wallet user to the hosted Circle wallet checkout.\nconst payerUrl = new URL(checkout.checkoutUrl, "https://app.hashpaylink.com").toString();\n\n// Autonomous agents can use the protocol endpoint directly.\n// The first GET returns HTTP 402 + PAYMENT-REQUIRED.\nconst agentPaymentUrl = new URL(\n  checkout.agentPaymentUrl,\n  "https://app.hashpaylink.com"\n).toString();`
  const agreementPayerEmail = paymentPath === 'human' ? '\n    payerEmail: customer.email,' : ''
  const agreementCode = `const agreement = await fetch("https://app.hashpaylink.com/api/v2/agreements", {\n  method: "POST",\n  headers: {\n    "X-API-Key": process.env.HASHPAYLINK_API_KEY,\n    "Idempotency-Key": order.id,\n    "Content-Type": "application/json"\n  },\n  body: JSON.stringify({\n    template: "fixed_unlock",\n    externalId: order.id,\n    resourceId: "content:premium-report",\n    title: "Premium report access",\n    description: "Unlock one premium research report.",\n    amount: "10",${agreementPayerEmail}\n    recipient: process.env.HASH_PAYLINK_ARC_RECIPIENT,\n    durationSeconds: 86400,\n    cancellationWindowSeconds: 900\n  })\n}).then(res => res.json());\n\n${paymentPath === 'human' ? '// Send agreement.payerReviewPath only to the named customer.' : '// Prepare this agreement through the dedicated agent payer route.'}\n// Mainnet activation is not enabled until deployment review is complete.`
  return <div><PanelHeader eyebrow="Integration" title="Connect your app" copy="Create a checkout on your server, then send your customer to the payment page." />
    {project.settlementMode !== 'usdc' && <p className="mt-4 rounded-xl border border-amber-200 p-4 text-sm leading-6">Local bank/mobile-money settlement is an existing integration reference. New-builder onboarding remains pending the flow audit, AML controls, daily-limit decisions and provider approval. This is stablecoin payment followed by local payout, not payment from a customer's bank account.</p>}
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

function PortalLoading({ delayed = false }: { delayed?: boolean }) {
  return <main id="developer-content">
    {delayed && <div role="alert" className="mx-5 mt-5 flex flex-wrap items-center gap-3 text-sm text-gray-600 dark:text-gray-300"><span>Taking longer than expected. Check your connection.</span><button type="button" onClick={() => window.location.reload()} className="min-h-11 rounded-full border border-gray-200 px-4 font-medium dark:border-white/10">Try again</button></div>}
    <DeveloperLoadingSkeleton />
  </main>
}
function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) { return <label className={cn('block space-y-1.5', className)}><span className="text-xs font-semibold text-gray-600 dark:text-gray-300">{label}</span>{children}</label> }
function PanelHeader({ eyebrow, title, copy, status }: { eyebrow: string; title: string; copy: string; status?: string }) { return <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-600 dark:text-blue-300">{eyebrow}</p><h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-gray-950 dark:text-white">{title}</h1><p className="mt-2 max-w-xl text-sm leading-6 text-gray-500 dark:text-gray-400">{copy}</p></div>{status && <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide', status === 'Configured' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300' : status === 'Suspended' ? 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300')}>{status}</span>}</div> }
function Message({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) { return <p role={tone === 'error' ? 'alert' : 'status'} className={cn('mt-5 rounded-xl border px-3 py-2 text-xs font-medium', tone === 'error' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200')}>{children}</p> }
function SecretReveal({ label, value }: { label: string; value: string }) { return <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-400/20 dark:bg-blue-400/10"><div className="flex items-center justify-between gap-3"><div><p className="text-xs font-semibold text-blue-900 dark:text-blue-100">{label}</p><p className="mt-1 text-xs text-blue-700/70 dark:text-blue-200/60">It will not be shown again.</p></div><CopyButton value={value} /></div><code className="mt-3 block break-all rounded-xl bg-white/70 p-3 text-xs text-blue-900 dark:bg-black/20 dark:text-blue-100">{value}</code></div> }
function ProjectIdCard({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]"><p className="text-xs font-bold uppercase tracking-[0.16em] text-gray-400">Project ID</p><div className="mt-1 flex items-center gap-2"><code className="min-w-0 flex-1 truncate text-xs font-semibold text-gray-700 dark:text-gray-200" title={value}>{value}</code><button type="button" aria-label="Copy developer project ID" onClick={async () => { await copyToClipboard(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="flex h-7 shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-500 transition hover:text-gray-900 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-300 dark:hover:text-white"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button></div></div> }
function CopyButton({ value }: { value: string }) { const [copied, setCopied] = useState(false); return <button type="button" onClick={async () => { await copyToClipboard(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/10 px-2.5 text-xs font-semibold text-current"><Copy className="h-3 w-3" />{copied ? 'Copied' : 'Copy'}</button> }
function EmptyState({ icon: Icon, text }: { icon: typeof Webhook; text: string }) { return <div className="flex min-h-32 flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 text-gray-400 dark:border-white/10"><Icon className="h-5 w-5" /><p className="mt-2 text-xs">{text}</p></div> }
