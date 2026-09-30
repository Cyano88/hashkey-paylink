import { pocketActivityAmount } from '../lib/pocketActivityPresentation'
import { pocketActivityIcon, pocketActivityShortDate } from '../components/pocketActivityIcon'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { QRCodeCanvas } from 'qrcode.react'
import { ArrowDownTrayIcon, ClipboardDocumentIcon, CheckIcon, TrashIcon, PlusIcon, RectangleStackIcon } from '@heroicons/react/24/outline'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'
import PocketActivityReceipt from '../components/PocketActivityReceipt'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { registerPocketRefreshHandler } from '../lib/pocketRefresh'
import { requestPocketPaymentApproval, takePocketPaymentApproval } from '../lib/pocketPaymentApproval'
import { collectionPayments, downloadCollectionStatement, type CollectionRecord } from '../lib/pocketCollectionStatement'
import { downloadPocketQr } from '../lib/pocketQrDownload'
import { copyToClipboard } from '../../lib/utils'
import { pocketActivityStatus } from '../lib/pocketReceipt'
import type { PocketActivityRow } from '../models/pocketActivity'

const iconButton='flex h-11 w-11 shrink-0 items-center justify-center rounded-full'
const historyPath=POCKET_BASE_PATH+'/activity/collections?kind=collections'
export default function PocketCollectionsPage() {
 const navigate=useNavigate(),[params]=useSearchParams()
 const {authenticated,email,getAccessToken}=usePocketIdentity()
 const [data,setData]=useState<{scope:string;links:CollectionRecord[];payments:PocketActivityRow[]}>({scope:'',links:[],payments:[]})
 const [busy,setBusy]=useState(true),[error,setError]=useState(''),[actionBusy,setActionBusy]=useState(false)
 const [copied,setCopied]=useState(''),[qr,setQr]=useState<CollectionRecord|null>(null),[sheet,setSheet]=useState<'export'|'delete'|null>(null)
 const [receipt,setReceipt]=useState<PocketActivityRow|null>(null)
 const qrRoot=useRef<HTMLDivElement>(null),sequence=useRef(0),inflight=useRef(false)
 const scope=authenticated?email.trim().toLowerCase():''
 const scopeRef=useRef(scope);scopeRef.current=scope
 const refresh=useCallback(async()=>{
  if(!authenticated){setBusy(false);return}
  const id=++sequence.current;setBusy(true)
  try {
   const token=await getAccessToken();if(!token)throw new Error('Sign in again to view collections.')
   const response=await fetch('/api/pocket/paylinks?action=collections',{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)})
   const next=await response.json().catch(()=>null)
   if(!response.ok||!next?.ok)throw new Error(next?.error?.message||'Collections could not load. Try again.')
   if(id===sequence.current&&scopeRef.current===scope){setData({scope,links:next.links,payments:next.payments});setError('')}
  }catch(reason){if(id===sequence.current&&scopeRef.current===scope)setError(reason instanceof Error?reason.message:'Collections could not load.')}
  finally{if(id===sequence.current&&scopeRef.current===scope)setBusy(false)}
 },[authenticated,getAccessToken,scope])
 useEffect(()=>{void refresh();const unregister=registerPocketRefreshHandler(refresh);const focus=()=>{if(document.visibilityState==='visible')void refresh()};window.addEventListener('focus',focus);const timer=setInterval(focus,30000);return()=>{sequence.current++;unregister();window.removeEventListener('focus',focus);clearInterval(timer)}},[refresh])
 const links=data.scope===scope?data.links:[],rows=data.scope===scope?data.payments:[]
 const selected=links.find(link=>link.eventId===params.get('collection'))
 const payments=selected?collectionPayments(selected,rows):[]
 useEffect(()=>{setReceipt(null);setSheet(null);setQr(null)},[params.get('collection'),scope])
 const act=async(fn:()=>Promise<void>)=>{
  if(inflight.current)return
  inflight.current=true;setActionBusy(true);setError('')
  try{await fn()}catch(reason){if(!(reason instanceof DOMException&&reason.name==='AbortError'))setError(reason instanceof Error?reason.message:'Could not complete this action.')}
  finally{inflight.current=false;setActionBusy(false)}
 }
 useEffect(()=>{
  if(!qr)return
  const frame=requestAnimationFrame(()=>{void act(async()=>{const canvas=qrRoot.current?.querySelector('canvas');if(!canvas)throw new Error('QR could not be prepared.');await downloadPocketQr(canvas)}).finally(()=>setQr(null))})
  return()=>cancelAnimationFrame(frame)
 },[qr])
 const remove=()=>void act(async()=>{
  if(!selected)return
  const target=selected,owner=scope
  setSheet(null)
  await requestPocketPaymentApproval()
  if(scopeRef.current!==owner)throw new Error('Account changed. Please try again.')
  const approval=takePocketPaymentApproval();if(!approval)throw new Error('Confirm with your PIN or fingerprint.')
  const response=await fetch('/api/pocket/paylinks',{method:'POST',headers:{'content-type':'application/json',authorization:approval.authorization,'x-pocket-payment-approval':approval.token},body:JSON.stringify({action:'delete',eventId:target.eventId,kind:target.kind}),signal:AbortSignal.timeout(15000)})
  const result=await response.json().catch(()=>null)
  if(!response.ok||!result?.ok)throw new Error(result?.error?.message||'Could not delete this collection.')
  setData(current=>({...current,links:current.links.map(link=>link.eventId===target.eventId?{...link,deletedAt:Date.now()}:link)}))
  navigate(historyPath,{replace:true})
 })
 return <PocketRouteShell active="home" onSelect={tab=>navigate(POCKET_BASE_PATH+(tab==='home'?'':tab==='profile'?'/profile':'/'+tab))} scrollKey={selected?.eventId||'collections'}>
  <PocketFlowHeader centered title={selected?'Payment history':'Collections'} onBack={()=>navigate(params.has('collection')?historyPath:POCKET_BASE_PATH+POCKET_ROUTES.usdc+'?flow=collection')} rightAction={selected?<button type="button" aria-label="Download collection statement" disabled={busy||actionBusy} className={iconButton} onClick={()=>setSheet('export')}><ArrowDownTrayIcon className="h-5 w-5" /></button>:<button type="button" aria-label="Create collection" className={iconButton} onClick={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.usdc+'?flow=collection')}><PlusIcon className="h-5 w-5" /></button>} />
  {error&&<div role="alert" className="text-sm text-red-500">{error}<button type="button" disabled={busy||actionBusy} onClick={()=>void refresh()} className="ml-2 underline">Try again</button></div>}
  {selected?<>
   <div className="flex items-center gap-3 py-3"><div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{selected.title}</h2><p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{selected.deletedAt?'Closed collection':selected.kind==='bank'?'Bank collection':'USDC collection'}</p></div>{!selected.deletedAt&&<button type="button" aria-label="Delete collection" disabled={actionBusy} onClick={()=>setSheet('delete')} className={iconButton}><TrashIcon className="h-5 w-5" /></button>}</div>
   <div>{payments.map((row,index)=>{const Icon=pocketActivityIcon(row);return <button key={row.eventId+'-'+row.txHash+'-'+index} type="button" onClick={()=>setReceipt(row)} className="flex w-full items-center gap-3 py-4 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5" /></span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{row.payer||'Payment'}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{pocketActivityShortDate(row.ts)}</span></span><span className="shrink-0 text-right"><span className="block text-xs font-semibold">{pocketActivityAmount(row)}</span>{row.amountNgn&&<span className="mt-1 block text-[10px] text-gray-500 dark:text-gray-400">{row.fiatCurrency||'NGN'} {Number(row.amountNgn).toLocaleString()}</span>}<span className="mt-1 block text-[10px] capitalize text-gray-500 dark:text-gray-400">{pocketActivityStatus(row)}</span></span></button>})}</div>
   {!payments.length&&<p className="py-12 text-center text-sm text-gray-500">No payments yet.</p>}
  </>:busy&&data.scope!==scope?<PocketRecentActivitySkeleton />:params.has('collection')?<p className="py-12 text-center text-sm text-gray-500">Collection not found.</p>:<>
   <div>{links.filter(link=>!link.deletedAt).sort((a,b)=>b.createdAt-a.createdAt).map(link=><div key={link.eventId} className="flex items-center py-2.5"><button type="button" className="flex min-w-0 flex-1 items-center gap-3 py-2 text-left" onClick={()=>navigate(historyPath+'&collection='+encodeURIComponent(link.eventId))}><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-100 dark:bg-[#0d0d0d]"><RectangleStackIcon className="h-5 w-5" /></span><span className="min-w-0"><span className="block truncate text-sm font-semibold">{link.title}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{link.kind==='bank'?'Bank collection':'USDC collection'}</span></span></button><button type="button" aria-label={'Download QR for '+link.title} disabled={actionBusy||!!qr} className={iconButton} onClick={()=>setQr(link)}><ArrowDownTrayIcon className="h-5 w-5" /></button><button type="button" aria-label={'Copy '+link.title+' link'} disabled={actionBusy} className={iconButton} onClick={()=>void act(async()=>{await copyToClipboard(link.paymentUrl);setCopied(link.eventId);setTimeout(()=>setCopied(''),1800)})}>{copied===link.eventId?<CheckIcon className="h-5 w-5" />:<ClipboardDocumentIcon className="h-5 w-5" />}</button></div>)}</div>
   {!links.some(link=>!link.deletedAt)&&!busy&&<p className="py-12 text-center text-sm text-gray-500">No active collections.</p>}
  </>}
  {qr&&<div ref={qrRoot} className="hidden" aria-hidden="true"><QRCodeCanvas value={qr.paymentUrl} size={1024} marginSize={4} level="M" /></div>}
  {receipt&&<PocketActivityReceipt row={payments.find(row=>row.eventId===receipt.eventId&&row.txHash===receipt.txHash)||receipt} onClose={()=>setReceipt(null)} />}
  {sheet==='export'&&selected&&<PocketBottomSheet title="Download statement" onClose={()=>setSheet(null)}><h2 className="mb-3 text-base font-bold">Download statement</h2>{(['csv','pdf'] as const).map(format=><button type="button" key={format} disabled={actionBusy} className="flex min-h-14 w-full items-center gap-3 text-sm font-semibold" onClick={()=>void act(async()=>{await downloadCollectionStatement(selected,rows,format);setSheet(null)})}><ArrowDownTrayIcon className="h-5 w-5" />{format.toUpperCase()} statement</button>)}</PocketBottomSheet>}
  {sheet==='delete'&&selected&&<PocketBottomSheet title="Delete collection" dismissOnBackdrop={false} onClose={()=>setSheet(null)}><h2 className="text-base font-bold">Delete collection?</h2><p className="my-4 text-sm text-gray-500 dark:text-gray-400">This closes the link to new payments. Your payment records are kept.</p><button type="button" disabled={actionBusy} className="pocket-cta-primary w-full" onClick={remove}>Continue</button></PocketBottomSheet>}
 </PocketRouteShell>
}
