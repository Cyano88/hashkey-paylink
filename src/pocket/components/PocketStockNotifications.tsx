import PocketIncomingRequestSheet from './PocketIncomingRequestSheet'
import {RequestMoney} from './PocketIcons'
﻿import {isIncomingPocketRequest} from '../lib/pocketInboxPolicy'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { stockNotificationsRequest, type StockInbox } from '../api/pocketStockNotificationsClient'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
import { xStockPath } from '../lib/pocketRail'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { PocketNotificationsSkeleton } from './PocketContentSkeletons'
export default function PocketStockNotifications({history=false}:{history?:boolean}){
 const {getAccessToken,email}=usePocketIdentity(),navigate=useNavigate()
 const [selectedId,setSelectedId]=useState(''),[actionError,setActionError]=useState('')
 const [inbox,setInbox]=useState<StockInbox|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[actionBusy,setActionBusy]=useState('')
 useEffect(()=>{let active=true,pending=false;setInbox(null);setSelectedId('');setBusy(true)
 const load=async()=>{if(pending||document.visibilityState!=='visible')return;pending=true;try{const next=await stockNotificationsRequest(getAccessToken);if(active){setInbox(next);setError('')};if(!history&&next.unread)await stockNotificationsRequest(getAccessToken,{action:'mark-read'}).catch(()=>undefined)}catch(e){if(active)setError(e instanceof Error?e.message:'Could not load notifications.')}finally{pending=false;if(active)setBusy(false)}}
 void load();const timer=window.setInterval(load,30000),unregister=registerPocketRefreshHandler(load);return()=>{active=false;clearInterval(timer);unregister()}
 },[getAccessToken,email,history])
 const selected=inbox?.requests.find(r=>r.id===selectedId&&isIncomingPocketRequest(r))
 const respond=async(action:'pay'|'decline')=>{
  if(!selected||actionBusy)return;setActionBusy(selected.id);setActionError('')
  try {
   if(selected.status==='pending')await stockNotificationsRequest(getAccessToken,{action:action==='pay'?'accept':'decline',id:selected.id})
   if(action==='pay'){setSelectedId('');navigate(xStockPath('send')+'?'+new URLSearchParams({recipient:selected.address,amount:selected.amount,asset:selected.symbol}).toString());return}
   setInbox(current=>current?{...current,requests:current.requests.map(r=>r.id===selected.id?{...r,status:'declined'}:r)}:current);setSelectedId('')
  }catch(e){setActionError(e instanceof Error?e.message:'Could not respond. Try again.')}finally{setActionBusy('')}
 }
 return <div className="space-y-2">{busy&&!inbox?<PocketNotificationsSkeleton/>:<>
 {inbox?.requests.filter(r=>history||isIncomingPocketRequest(r)).map(r=><article key={r.id} className="py-3"><button disabled={!isIncomingPocketRequest(r)} onClick={()=>{setActionError('');setSelectedId(r.id)}} className="flex w-full items-center gap-3 text-left"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/[0.04] dark:bg-white/[0.08]"><RequestMoney className="h-4 w-4"/></span><span><span className="block text-xs font-bold">{r.direction==='incoming'?'Request from ID:'+r.senderPocketId:'Requested from ID:'+r.payerPocketId}</span><span className="mt-1 block text-[11px] text-gray-500">{formatStockQuantity(r.amount)} {r.symbol}</span></span></button></article>)}
 {inbox&&!inbox.requests.some(r=>history||isIncomingPocketRequest(r))&&<p className="py-12 text-center text-xs text-gray-400">{history?'No requests yet.':'No stock notifications yet.'}</p>}
 </>}{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}{selected&&<PocketIncomingRequestSheet title="Stock request" amount={formatStockQuantity(selected.amount)+' '+selected.symbol} sender={'ID:'+selected.senderPocketId} canDecline={selected.status==='pending'} busy={Boolean(actionBusy)} error={actionError} onPay={()=>void respond('pay')} onDecline={()=>void respond('decline')} onClose={()=>setSelectedId('')}/>}</div>
}
