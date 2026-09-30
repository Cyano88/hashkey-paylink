import { useRef, useState } from 'react'
import { TrashIcon, InboxArrowDownIcon } from '@heroicons/react/24/outline'
import PocketBottomSheet from '../../components/PocketBottomSheet'
import PocketActivityReceipt from '../../components/PocketActivityReceipt'
import PocketRecentActivitySkeleton from '../../components/PocketRecentActivitySkeleton'
import type { PocketRequestItem } from '../../api/pocketRequestsClient'
import { cancelPocketRequest } from '../../api/pocketRequestsClient'
import type { PocketActivityRow } from '../../models/pocketActivity'
import usePocketIdentity from '../../hooks/usePocketIdentity'
import { requestActivityRows } from '../../lib/pocketRequestActivity'

export default function PocketRequestHistory({requests,rows,busy,error,onRefresh}:{requests:PocketRequestItem[];rows:PocketActivityRow[];busy:boolean;error:string;onRefresh:()=>Promise<void>}) {
 const {getAccessToken}=usePocketIdentity()
 const [selected,setSelected]=useState(''),[revealed,setRevealed]=useState(''),[cancel,setCancel]=useState<PocketRequestItem|null>(null)
 const [working,setWorking]=useState(false),[actionError,setActionError]=useState(''),[removed,setRemoved]=useState<string[]>([])
 const touch=useRef({x:0,y:0}),swiped=useRef(false),locked=useRef(false)
 const visible=requests.filter(item=>item.status!=='cancelled'&&!removed.includes(item.id))
 const receipt=requestActivityRows(rows,visible).find(row=>row.eventId===selected)
 const remove=async()=>{
  if(!cancel||locked.current)return
  locked.current=true;setWorking(true);setActionError('')
  try {const token=await getAccessToken();if(!token)throw new Error('Sign in again to cancel this request.');await cancelPocketRequest(token,cancel.id);setRemoved(value=>[...value,cancel.id]);setCancel(null);setRevealed('');await onRefresh()}
  catch(reason){setActionError(reason instanceof Error?reason.message:'Could not cancel this request.');void onRefresh()}
  finally{locked.current=false;setWorking(false)}
 }
 return <>
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
  {busy&&!visible.length?<PocketRecentActivitySkeleton/>:!visible.length?<p className="py-12 text-center text-sm text-gray-500">No requests yet.</p>:visible.map(item=>{
   const canCancel=item.direction==='outgoing'&&item.status==='pending'
   return <div key={item.id} className="relative overflow-hidden rounded-2xl">
    {canCancel&&<button type="button" aria-label={'Cancel request '+item.title} tabIndex={revealed===item.id?0:-1} className="absolute inset-y-0 right-0 flex w-16 items-center justify-center bg-red-600 text-white" onClick={()=>{setActionError('');setCancel(item)}}><TrashIcon className="h-5 w-5"/></button>}
    <button type="button" aria-label={item.title+', '+item.status} style={{transform:revealed===item.id?'translateX(-64px)':'translateX(0)',touchAction:'pan-y'}} className="relative flex w-full items-center gap-3 bg-white py-4 text-left transition-transform dark:bg-black" onTouchStart={event=>{touch.current={x:event.touches[0].clientX,y:event.touches[0].clientY};swiped.current=false}} onTouchEnd={event=>{const dx=event.changedTouches[0].clientX-touch.current.x,dy=event.changedTouches[0].clientY-touch.current.y;if(canCancel&&Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)){swiped.current=true;setRevealed(dx<0?item.id:'')}}} onKeyDown={event=>{if(canCancel&&event.key==='Delete'){setActionError('');setCancel(item)}}} onClick={()=>{if(swiped.current){swiped.current=false;return}if(revealed){setRevealed('');return}setSelected(item.id)}}>
     <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><InboxArrowDownIcon className="h-5 w-5"/></span>
     <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{item.title}</span><span className="mt-1 block truncate text-xs text-gray-500">{item.direction==='incoming'?'From '+item.senderName:'To '+item.recipientName}</span></span>
     <span className="text-right"><span className="block text-xs font-semibold">{item.amount} USDC</span><span className="mt-1 block text-[10px] capitalize text-gray-500">{item.status==='pending'?'Awaiting response':item.status==='accepted'?'Awaiting payment':item.status==='paid'?'Successful':item.status}</span></span>
    </button>
   </div>
  })}
  {receipt&&<PocketActivityReceipt row={receipt} onClose={()=>setSelected('')}/>}
  {cancel&&<PocketBottomSheet title="Cancel request" dismissOnBackdrop={false} dismissible={!working} onClose={()=>setCancel(null)}><h2 className="text-base font-bold">Cancel this request?</h2><p className="my-4 text-sm text-gray-500">It will be removed from both people's active requests.</p>{actionError&&<p role="alert" className="mb-4 text-xs text-red-500">{actionError}</p>}<button type="button" disabled={working} className="pocket-cta-primary w-full" onClick={()=>void remove()}>{working?'Cancelling...':'Cancel request'}</button></PocketBottomSheet>}
 </>
}
