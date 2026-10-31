import {Conversation,ReplyComposer,RefreshButton} from './SupportConversation'
import OperationsCasesPanel from './OperationsCasesPanel'
import HashSupportKnowledgePanel from './HashSupportKnowledgePanel'
import type { HashKnowledge } from '../../api/hash-support/knowledge'
import { useCallback, useEffect, useMemo, useState, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { Check, Loader2, Send } from '../pocket/components/PocketIcons'
import { ArrowPathIcon as RefreshCw } from '@heroicons/react/24/outline'

type SupportMessage = { id: string; author: 'user' | 'agent' | 'staff'; displayName?: string; kind?: 'automatic_reminder' | 'automatic_resolution' | 'transaction_report'; text: string; createdAt: number }
type SupportCase = {
  escalation?:{status:string;destination:string}
  id: string
  status: 'open' | 'assigned' | 'waiting_user' | 'resolved'
  category: string
  priority: 'normal' | 'high'
  transaction?: Record<string,string|number|undefined>
  reportReason?:string
  summary: string
  resolutionRequestedAt?: number
  supportEscalatedAt?: number
  assignedTo?: string
  customer?: { fullName: string; email: string; pocketId: string }
  messages: SupportMessage[]
  createdAt: number
  updatedAt: number
}

function when(value: number) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

async function readSupportResponse(response: Response) {
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.toLowerCase().includes('application/json')) {
    throw new Error(response.status >= 500
      ? 'Pocket Support is reconnecting. Your loaded conversation is safe; try again in a moment.'
      : 'Pocket Support returned an unexpected response. Please refresh and try again.')
  }
  try {
    return await response.json() as { knowledge?:HashKnowledge[]; ok?: boolean; cases?: SupportCase[]; case?: SupportCase; displayName?: string; avatarDataUrl?:string; error?: string }
  } catch {
    throw new Error('Pocket Support returned an incomplete response. Please try again.')
  }
}

export default function PocketSupportOperationsPanel() {
  const { getAccessToken } = usePrivy()
  const [cases, setCases] = useState<SupportCase[]>([])
  const [activeId, setActiveId] = useState('')
  const [reply, setReply] = useState('')
  const [search,setSearch]=useState(''),[filter,setFilter]=useState('open'),[refreshing,setRefreshing]=useState(false)
  const drafts=useRef<Record<string,string>>({}),actionLock=useRef(false)
  const [displayName, setDisplayName] = useState('')
  const [avatarDataUrl,setAvatarDataUrl]=useState('')
  const [photoBusy,setPhotoBusy]=useState(false)
  const [nameSaved, setNameSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const call = useCallback(async (body: Record<string, unknown>) => {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/pocket/support/cases?workspace=pocket', {
      method: 'POST', cache: 'no-store',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readSupportResponse(response)
    if (!response.ok || !data.ok) throw new Error(data.error || 'Support request failed.')
    return data
  }, [getAccessToken])

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    if (!quiet) setError('')
    try {
      const data = await call({ action: 'staff-list' })
      const next = data.cases || []
      if (!quiet) { setDisplayName(data.displayName || ''); setAvatarDataUrl(data.avatarDataUrl || ''); setNameSaved(Boolean(data.displayName)) }
      setCases(next)
      setActiveId(current => current && next.some(item => item.id === current) ? current : next.find(item=>item.status!=='resolved')?.id || next[0]?.id || '')
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Support cases could not be loaded.')
    } finally { if (!quiet) setLoading(false) }
  }, [call])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(true), 15000)
    return () => window.clearInterval(timer)
  }, [load])

  const active = useMemo(() => cases.find(item => item.id === activeId), [activeId, cases])
  async function operate(action: 'staff-reply' | 'staff-assign' | 'staff-resolve') {
    if (actionLock.current || !active || (action === 'staff-reply' && !reply.trim())) return
    actionLock.current=true
    setBusy(true); setError('')
    try {
      await call({ action, caseId: active.id, ...(action === 'staff-reply' ? { message: reply.trim() } : {}) })
      if(action==='staff-reply'){setReply('');delete drafts.current[active.id]}
      await load(true)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Support action failed.') }
    finally { setBusy(false); actionLock.current=false }
  }

  async function choosePhoto(file?:File) {
    if(!file)return
    setError('')
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5_000_000){setError('Choose a JPEG, PNG or WebP image under 5 MB.');return}
    setPhotoBusy(true)
    let objectUrl=''
    try {
      objectUrl=URL.createObjectURL(file)
      const image=new Image()
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Image could not be opened.'));image.src=objectUrl})
      const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64
      const context=canvas.getContext('2d');if(!context)throw Error('Image processing unavailable.')
      const size=Math.min(image.naturalWidth,image.naturalHeight)
      if(!size)throw Error('Image could not be opened.')
      context.drawImage(image,(image.naturalWidth-size)/2,(image.naturalHeight-size)/2,size,size,0,0,64,64)
      const data=canvas.toDataURL('image/jpeg',0.8)
      if(data.length>16000)throw Error('Image could not be prepared.')
      setAvatarDataUrl(data);setNameSaved(false)
    }catch{setError('This image could not be opened. Choose another photo.')}
    finally{if(objectUrl)URL.revokeObjectURL(objectUrl);setPhotoBusy(false)}
  }
  async function saveName() {
    setBusy(true); setError('')
    try { await call({action:'staff-profile',displayName,avatarDataUrl}); setNameSaved(true) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Profile could not be saved.') }
    finally { setBusy(false) }
  }
  const visible=cases.filter(c=>(filter==='all'||(filter==='resolved'?c.status==='resolved':c.status!=='resolved'))&&[c.customer?.fullName,c.customer?.email,c.customer?.pocketId,c.summary,c.id].join(' ').toLowerCase().includes(search.toLowerCase()))
  const customerName=(c:SupportCase)=>c.customer?.fullName||c.customer?.pocketId||'Pocket customer'
  const status=(c:SupportCase)=>c.escalation?.status==='pending'?'In review':c.status==='resolved'?'Resolved':c.status==='waiting_user'?'Awaiting reply':c.assignedTo?'Assigned':'Needs reply'
  if (loading) return <div aria-label="Loading conversations" role="status" className="mt-6 h-96 animate-pulse rounded-2xl bg-gray-100 dark:bg-white/5"/>
  return <section className="mt-5">
    <div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-lg font-semibold">Pocket conversations</h2><p className="mt-1 text-xs text-gray-500">Customer messages and assistant handoffs. Updates automatically.</p></div><RefreshButton busy={refreshing} label="Refresh conversations" onClick={()=>{setRefreshing(true);void load(true).finally(()=>setRefreshing(false))}}/></div>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#111216] lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="border-b border-gray-200 p-3 dark:border-white/10 lg:border-b-0 lg:border-r"><input aria-label="Search conversations" placeholder="Search customers or messages" value={search} onChange={e=>setSearch(e.target.value)} className="h-10 w-full rounded-xl bg-gray-100 px-3 text-sm outline-none focus:ring-2 focus:ring-gray-300 dark:bg-white/5"/><div className="my-3 flex gap-1" role="group" aria-label="Conversation status">{[['open','Open'],['resolved','Resolved'],['all','All']].map(([id,label])=><button key={id} type="button" aria-pressed={filter===id} onClick={()=>setFilter(id)} className={'rounded-lg px-3 py-2 text-xs font-medium '+(filter===id?'bg-gray-100 text-gray-950 dark:bg-white/10 dark:text-white':'text-gray-500')}>{label}</button>)}</div><div className="max-h-64 space-y-1 overflow-y-auto lg:max-h-[65vh]">{visible.map(c=><button type="button" key={c.id} disabled={busy} onClick={()=>{drafts.current[activeId]=reply;setActiveId(c.id);setReply(drafts.current[c.id]||'')}} aria-current={activeId===c.id?'true':undefined} className={'w-full rounded-xl p-3 text-left transition '+(activeId===c.id?'bg-blue-50 dark:bg-blue-500/10':'hover:bg-gray-50 dark:hover:bg-white/5')}><div className="flex items-center gap-3"><span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-white/10 dark:text-gray-300">{customerName(c).slice(0,1).toUpperCase()}</span><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{customerName(c)}</p><p className="mt-1 text-[11px] text-gray-500">{status(c)}</p></div></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-gray-500">{c.messages[c.messages.length-1]?.text||c.summary}</p></button>)}{!visible.length&&<p className="px-3 py-8 text-center text-sm text-gray-500">No conversations here.</p>}</div></aside>
      {active?<div className="min-w-0"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 p-5 dark:border-white/10"><div><h3 className="font-semibold">{customerName(active)}</h3><p className="mt-1 text-xs text-gray-500">{active.customer?.email||'Pocket customer'} &middot; {status(active)}</p></div><div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void operate('staff-assign')} className="min-h-9 rounded-lg border border-gray-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-white/10">Assign to me</button><button type="button" disabled={busy||active.status==='resolved'||active.escalation?.status==='pending'||Boolean(active.resolutionRequestedAt)} onClick={()=>void operate('staff-resolve')} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-xs font-medium disabled:opacity-40 dark:border-white/10"><Check className="h-3.5 w-3.5"/>Resolve</button></div></header>
      <Conversation messages={active.messages} customerName={customerName(active)} staffName="Pocket Support" conversationId={active.id}/>
      <ReplyComposer value={reply} onChange={setReply} onSend={()=>void operate('staff-reply')} busy={busy} disabled={active.status==='resolved'} label={'Reply to '+customerName(active)}/>
      <details className="border-t border-gray-100 px-5 py-4 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium text-gray-500">Case details & escalation</summary><p className="mt-3 text-sm">{active.summary}</p><p className="mt-2 text-xs text-gray-500">{active.id} &middot; {active.category.replace(/_/g,' ')} &middot; {when(active.createdAt)}</p>{active.transaction&&<dl className="mt-4 space-y-2">{Object.entries(active.transaction).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=><div key={k} className="grid gap-1 text-xs sm:grid-cols-[9rem_1fr]"><dt className="text-gray-500">{k.replace(/([A-Z])/g,' $1')}</dt><dd className="break-all">{String(v)}</dd></div>)}</dl>}<OperationsCasesPanel key={active.id} workspaceId="pocket" selectedCaseId={active.id} refreshKey={active.updatedAt} onChanged={()=>void load(true)}/></details></div>:<div className="grid min-h-80 place-content-center p-8 text-center"><h3 className="font-medium">You are all caught up</h3><p className="mt-2 text-sm text-gray-500">Customer handoffs will appear here.</p></div>}
    </div>
    <div className="mt-5 flex flex-col gap-3"><details className="rounded-xl border border-gray-200 p-4 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium text-gray-500">Your support profile</summary><div className="mt-4 flex flex-wrap items-end gap-3">{avatarDataUrl&&<img src={avatarDataUrl} alt="Your support profile" className="h-10 w-10 rounded-full object-cover"/>}<label className="text-xs">Photo<input type="file" className="mt-2 block max-w-52 text-xs" accept="image/jpeg,image/png,image/webp" disabled={busy||photoBusy} onChange={e=>{void choosePhoto(e.target.files?.[0]);e.target.value=''}}/></label><label className="text-xs">Display name<input aria-label="Support display name" maxLength={60} value={displayName} onChange={e=>{setDisplayName(e.target.value);setNameSaved(false)}} className="mt-2 block min-h-10 rounded-lg border border-gray-200 bg-transparent px-3 text-sm dark:border-white/10"/></label><button type="button" disabled={busy||photoBusy||!displayName.trim()||nameSaved} onClick={()=>void saveName()} className="developer-primary disabled:opacity-40">{nameSaved?'Saved':'Save profile'}</button></div></details><details className="rounded-xl border border-gray-200 p-4 dark:border-white/10"><summary className="cursor-pointer text-xs font-medium text-gray-500">Assistant knowledge</summary><HashSupportKnowledgePanel call={call} sourceCase={active}/></details></div>
  </section>
}
