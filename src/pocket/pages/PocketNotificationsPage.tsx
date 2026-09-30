import {pocketRequestPaymentPath} from '../lib/pocketRequestPaymentPath'
import PocketIncomingRequestSheet from '../components/PocketIncomingRequestSheet'
import {isIncomingPocketRequest} from '../lib/pocketInboxPolicy'
import { cachedPocketNotifications, readPocketNotifications,markPocketNotificationsRead,type PocketNotice } from '../api/pocketNotificationsClient'
import { pocketNotificationPath } from '../lib/pocketNotificationPath'
import { PocketNotificationsSkeleton } from '../components/PocketContentSkeletons'
import { useCallback, useEffect, useRef, useState, type TouchEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { AlertCircle, Bell, Loader2, Lock, CheckCircle2, MessageCircle, RequestMoney } from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { cachedPocketRequestInbox, decidePocketRequest, markPocketRequestsRead, POCKET_REQUESTS_UPDATED_EVENT, readPocketRequestInbox, type PocketRequestItem } from '../api/pocketRequestsClient'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'

function noticeIcon(category:PocketNotice['category']){return category==='security'?Lock:category==='verification'?CheckCircle2:category==='support'?MessageCircle:Bell}
export default function PocketNotificationsPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const [notices,setNotices]=useState<PocketNotice[]>([])
  const [items, setItems] = useState<PocketRequestItem[]>([])
  const [busy, setBusy] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [selectedId,setSelectedId]=useState('')
  const [actionError,setActionError]=useState('')
  const loaded=useRef(false)
  const [acting, setActing] = useState('')
  const [error, setError] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pullStartY = useRef<number | null>(null)
  const pullDistanceRef = useRef(0)
  const refreshTriggered = useRef(false)
  const tokenRef = useRef(getAccessToken)
  tokenRef.current = getAccessToken
  const scope = useRef(0)
  const pendingLoad = useRef<Promise<void> | null>(null)
  useEffect(() => {
    scope.current += 1; pendingLoad.current = null; loaded.current = false
    setItems([]); setNotices([]); setActing(''); setSelectedId(''); setActionError(''); setError('')
    return () => { scope.current += 1; pendingLoad.current = null }
  }, [authenticated, email])

  const load = useCallback(({ showBusy = false, markRead = false } = {}) => {
    if (!authenticated) { setBusy(false); return Promise.resolve() }
    if (pendingLoad.current) return pendingLoad.current
    const generation = scope.current
    const current = () => generation === scope.current
    if (showBusy) setBusy(true)
    const work = (async () => {
      try {
        const token = await tokenRef.current()
        if (!current()) return
        if (!token) throw new Error('Sign in again to read requests.')
        if (!loaded.current) {
          const savedRequests=cachedPocketRequestInbox(token), savedNotices=cachedPocketNotifications(token)
          if(savedRequests){setItems(savedRequests.requests);loaded.current=true}
          if(savedNotices){setNotices(savedNotices.notices);loaded.current=true}
          if(savedRequests&&savedNotices)setBusy(false)
        }
        // Paint each feed as it arrives; a slow notices API must not hide requests.
        const [requestsResult,noticeResult]=await Promise.allSettled([
          readPocketRequestInbox(token).then(inbox => {
            if (!current()) return
            setItems(inbox.requests); loaded.current=true
            if(markRead&&inbox.unreadCount>0)void markPocketRequestsRead(token).catch(()=>undefined)
          }),
          readPocketNotifications(token).then(inbox => {
            if (!current()) return
            setNotices(inbox.notices); loaded.current=true
            if(markRead&&inbox.unreadCount>0)void markPocketNotificationsRead(token,inbox.notices.filter(n=>!n.readAt).map(n=>n.eventId)).catch(()=>undefined)
          }),
        ])
        if (!current()) return
        const failed=requestsResult.status==='rejected'||noticeResult.status==='rejected'
        if(failed&&(!loaded.current||markRead))setError('Some notifications could not refresh. Try again.')
        else if(!failed)setError('')

      } catch (reason) {
        if (current()&&(!loaded.current||markRead)) setError(reason instanceof Error ? reason.message : 'Could not load requests.')
      } finally {
        if (current()) { pendingLoad.current = null; setBusy(false) }
      }
    })()
    pendingLoad.current = work
    return work
  }, [authenticated, email])

  const refresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    pullDistanceRef.current = 32
    setPullDistance(32)
    try {
      await load({ markRead: true })
    }
    finally { pullDistanceRef.current = 0; setRefreshing(false); setPullDistance(0) }
  }, [load, refreshing])

  useEffect(() => { void load({ showBusy: true, markRead: true }) }, [load])
  useEffect(() => {
    if (!authenticated) return
    const update = () => document.visibilityState === 'visible' ? load() : Promise.resolve()
    const visibility = () => { if (document.visibilityState === 'visible') update() }
    const interval = window.setInterval(update, 30_000)
    const unregister = registerPocketRefreshHandler(update)
    window.addEventListener(POCKET_REQUESTS_UPDATED_EVENT, update)
    window.addEventListener('focus', update)
    window.addEventListener('online', update)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.clearInterval(interval)
      unregister()
      window.removeEventListener(POCKET_REQUESTS_UPDATED_EVENT, update)
      window.removeEventListener('focus', update)
      window.removeEventListener('online', update)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [authenticated, load])

  const startPull = (event: TouchEvent<HTMLDivElement>) => {
    if (refreshing || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    refreshTriggered.current = false
    pullStartY.current = event.touches[0].clientY
  }
  const movePull = (event: TouchEvent<HTMLDivElement>) => {
    if (pullStartY.current === null || event.touches.length !== 1 || (scrollerRef.current?.scrollTop ?? 0) > 0) return
    const distance = Math.min(78, Math.max(0, (event.touches[0].clientY - pullStartY.current) * 0.62))
    pullDistanceRef.current = distance
    setPullDistance(distance)
    if (distance >= 62 && !refreshTriggered.current) { refreshTriggered.current = true; void refresh() }
  }
  const finishPull = () => {
    pullStartY.current = null
    if (pullDistanceRef.current >= 62 && !refreshTriggered.current) void refresh()
    else { pullDistanceRef.current = 0; setPullDistance(0) }
  }

  const selected=items.find(item=>item.id===selectedId&&isIncomingPocketRequest(item))
  const respond = async (decision:'pay'|'decline') => {
    if(!selected||acting)return
    const generation=scope.current
    setActing(selected.id);setActionError('')
    try {
      const token=await tokenRef.current()
      if(!token)throw Error('Sign in again to respond.')
      // Acceptance is a separate step; only a later Pay tap opens payment.
      const next=selected.status==='pending'?await decidePocketRequest(token,selected.id,decision==='pay'?'accept':'decline'):selected
      if(generation!==scope.current)return
      setItems(current=>current.map(item=>item.id===next.id?next:item))
      if(decision==='decline'){setSelectedId('');return}
      if(selected.status==='pending')return
      setSelectedId('');navigate(POCKET_BASE_PATH+pocketRequestPaymentPath(next.id))
    } catch(reason) {if(generation===scope.current)setActionError(reason instanceof Error?reason.message:'Could not respond. Try again.')}
    finally {if(generation===scope.current)setActing('')}
  }

  const timeline: Array<{key:string;at:number;notice?:PocketNotice;request?:PocketRequestItem}>=[...notices.map(notice=>({key:'notice:'+notice.id,at:notice.updatedAt,notice})),...items.filter(isIncomingPocketRequest).map(request=>({key:'request:'+request.id,at:request.updatedAt||request.createdAt,request}))].sort((a,b)=>b.at-a.at)
  const dateLabel=(at:number)=>new Date(at).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})
  return <div ref={scrollerRef} onTouchStart={startPull} onTouchMove={movePull} onTouchEnd={finishPull} onTouchCancel={() => { pullStartY.current = null; if (!refreshing) { pullDistanceRef.current = 0; setPullDistance(0) } }} className="fixed inset-0 z-[45] overflow-y-auto overscroll-y-contain bg-[#F5F5F7] text-gray-950 dark:bg-black dark:text-white">
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-[max(.5rem,var(--pocket-safe-top))] z-[60] flex justify-center transition-opacity duration-150" style={{ opacity: pullDistance > 4 || refreshing ? 1 : 0, transform: `translateY(${Math.max(0, pullDistance - 30)}px)` }}><span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm ring-1 ring-gray-200/70 dark:bg-[#121212] dark:text-gray-300 dark:ring-white/10"><Loader2 className="h-6 w-6 animate-spin" style={{ animationPlayState: refreshing ? 'running' : 'paused' }} /></span></div>
    <main className="mx-auto min-h-full w-full max-w-[462px] px-4 pb-[max(2rem,var(--pocket-safe-bottom))] pt-[calc(var(--pocket-safe-top)+1rem)]"><PocketFlowHeader title="Notifications" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      {busy&&!timeline.length?<PocketNotificationsSkeleton/>:error&&!timeline.length?<section className="mt-20 text-center"><AlertCircle className="mx-auto h-7 w-7 text-gray-300"/><p className="mt-4 text-sm font-bold">Notifications could not load</p><p className="mt-2 text-xs text-gray-500">{error}</p><button type="button" onClick={()=>void load({showBusy:true,markRead:true})} className="pocket-cta-primary mt-5 px-6">Try again</button></section>:timeline.length?<section className="mt-5">{timeline.map((entry,index)=>{
        const item=entry.request,notice=entry.notice,Icon=notice?noticeIcon(notice.category):RequestMoney
        const title=notice?.title||item!.title
        const body=notice?.body||`${item!.amount} USDC ${item!.direction==='incoming'?'from '+item!.senderName:'to '+item!.recipientName} \u00b7 ${item!.status==='pending'?'Awaiting response':item!.status}`
        const open=()=>{if(notice){const path=pocketNotificationPath(notice.path);if(path)navigate(POCKET_BASE_PATH+path)}else if(item){setActionError('');setSelectedId(item.id)}}
        return <div key={entry.key}>{(!index||dateLabel(entry.at)!==dateLabel(timeline[index-1].at))&&<p className="pb-2 pt-4 text-[11px] font-semibold text-gray-500">{dateLabel(entry.at)}</p>}<article className="py-3"><button type="button" onClick={open} className="flex w-full items-start gap-3 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.08]"><Icon className="h-4 w-4"/></span><span className="min-w-0 flex-1"><span className="block text-xs font-bold">{title}</span><span className="mt-1 block text-[11px] leading-5 text-gray-500 dark:text-gray-400">{body}</span></span>{notice&&!notice.readAt&&<span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"/>}</button>
</article></div>
      })}</section>:<section className="mt-20 text-center"><Bell className="mx-auto h-7 w-7 text-gray-300"/><p className="mt-4 text-sm font-black">No notifications yet</p><p className="mt-2 text-xs text-gray-500">Incoming requests and Pocket updates will appear here.</p></section>}
      {error && (items.length > 0 || notices.length > 0) && <p role="alert" className="mt-4 rounded-2xl bg-red-50 p-3 text-xs font-semibold text-red-700 dark:bg-red-400/10 dark:text-red-200">Could not refresh notifications. Pull down to try again.</p>}
    </main>
    {selected&&<PocketIncomingRequestSheet title={selected.title} amount={selected.amount+' USDC'} sender={selected.senderName} canDecline={selected.status==='pending'} busy={Boolean(acting)} error={actionError} onPay={()=>void respond('pay')} onDecline={()=>void respond('decline')} onClose={()=>setSelectedId('')}/>}
  </div>
}
