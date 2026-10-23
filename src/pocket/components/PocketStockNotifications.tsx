import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { stockNotificationsRequest, type StockInbox } from '../api/pocketStockNotificationsClient'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
import { xStockPath } from '../lib/pocketRail'
import { formatStockQuantity } from '../lib/pocketStockDisplay'
import { PocketNotificationsSkeleton } from './PocketContentSkeletons'
export default function PocketStockNotifications(){
 const {getAccessToken,email}=usePocketIdentity(),navigate=useNavigate()
 const [inbox,setInbox]=useState<StockInbox|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[actionBusy,setActionBusy]=useState('')
 useEffect(()=>{let active=true,pending=false;setInbox(null);setBusy(true)
 const load=async()=>{if(pending||document.visibilityState!=='visible')return;pending=true;try{const next=await stockNotificationsRequest(getAccessToken);if(active){setInbox(next);setError('')};if(next.unread)await stockNotificationsRequest(getAccessToken,{action:'mark-read'})}catch(e){if(active)setError(e instanceof Error?e.message:'Could not load notifications.')}finally{pending=false;if(active)setBusy(false)}}
 void load();const timer=window.setInterval(load,30000),unregister=registerPocketRefreshHandler(load);return()=>{active=false;clearInterval(timer);unregister()}
 },[getAccessToken,email])
 const decide=async(id:string,action:'accept'|'decline')=>{if(actionBusy)return;setActionBusy(id);setError('');try{await stockNotificationsRequest(getAccessToken,{action,id});setInbox(await stockNotificationsRequest(getAccessToken))}catch(e){setError(e instanceof Error?e.message:'Could not update request.')}finally{setActionBusy('')}}
 return <div className="space-y-2">{busy&&!inbox?<PocketNotificationsSkeleton/>:<>
 {inbox?.requests.map(r=><article key={r.id} className="rounded-2xl bg-white px-3 py-3 dark:bg-[#121212]"><p className="text-xs font-bold">{r.direction==='incoming'?'Request from ID:'+r.senderPocketId:'Requested from ID:'+r.payerPocketId}</p><p className="mt-1 text-xs font-bold">{formatStockQuantity(r.amount)} {r.symbol}</p><p className="mt-1 text-[11px] capitalize text-gray-400">{r.status}</p>{r.direction==='incoming'&&(r.status==='pending'||r.status==='accepted')&&<div className="mt-2 flex gap-2">{r.status==='pending'?<button disabled={!!actionBusy} className="min-h-11 flex-1 rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950" onClick={()=>void decide(r.id,'accept')}>Accept</button>:<button className="min-h-11 flex-1 rounded-full bg-gray-950 text-xs font-bold text-white dark:bg-white dark:text-gray-950" onClick={()=>navigate(xStockPath('send')+'?'+new URLSearchParams({recipient:r.address,amount:r.amount,asset:r.symbol}).toString())}>Pay request</button>}<button disabled={!!actionBusy} className="min-h-11 flex-1 text-xs text-gray-500" onClick={()=>void decide(r.id,'decline')}>Decline</button></div>}</article>)}
 {inbox?.notices.map(n=><article key={n.id} className="rounded-2xl bg-white px-3 py-3 dark:bg-[#121212]"><div className="flex items-start justify-between gap-3"><p className="text-xs font-bold">{n.title}</p><time className="shrink-0 text-[10px] text-gray-400" dateTime={new Date(n.at).toISOString()}>{new Date(n.at).toLocaleDateString(undefined,{month:'short',day:'numeric'})}</time></div><p className="mt-1 text-[11px] leading-4 text-gray-500">{n.body}</p>{n.hash&&<a className="mt-1 inline-flex items-center py-2 text-[11px] font-bold" href={'https://www.oklink.com/x-layer/tx/'+n.hash} target="_blank" rel="noreferrer">View transaction</a>}</article>)}
 {inbox&&!inbox.notices.length&&!inbox.requests.length&&<p className="py-12 text-center text-xs text-gray-400">No stock notifications yet.</p>}
 </>}{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}</div>
}
