import {createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from 'react'
import {useNavigate} from 'react-router-dom'
import type {PaylinkReceipt} from '../../lib/paymentReceiptPdf'
import {pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES} from '../lib/pocketRoutes'
import {pocketReportReasons, type PocketReportSelector, type PocketTransactionReport} from '../lib/pocketTransactionReport'
import PocketBottomSheet from './PocketBottomSheet'

type ReportService={call:(body:Record<string,unknown>)=>Promise<PocketTransactionReport|null>;view:(id:string)=>void}
export const PocketReceiptReportContext=createContext<ReportService|null>(null)
export function PocketReceiptReportProvider({getAccessToken,children}:{getAccessToken?:()=>Promise<string|null>;children:ReactNode}) {
  const navigate=useNavigate()
  const service=useMemo<ReportService|null>(()=>getAccessToken?{
    async call(body){
      const token=await getAccessToken();if(!token)throw Error('Sign in again to report this transaction.')
      const response=await fetch(pocketApiUrl('/api/pocket/support/cases'),{method:'POST',cache:'no-store',headers:{authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)})
      const data=await response.json().catch(()=>null)
      if(!response.ok||!data?.ok)throw Error(data?.error||'Report could not be saved. Please try again.')
      return data.case||null
    },
    view(id){navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.assistant}?case=${encodeURIComponent(id)}`)},
  }:null,[getAccessToken,navigate])
  return <PocketReceiptReportContext.Provider value={service}>{children}</PocketReceiptReportContext.Provider>
}
export default function PocketReceiptReport({receipt,onClose}:{receipt:PaylinkReceipt;onClose:()=>void}) {
  const service=useContext(PocketReceiptReportContext)
  const selector=useMemo<PocketReportSelector>(()=>({chain:receipt.chain,eventId:receipt.eventId,txHash:receipt.txHash||''}),[receipt.chain,receipt.eventId,receipt.txHash])
  const [report,setReport]=useState<PocketTransactionReport|null>(null)
  const [open,setOpen]=useState(false),[checking,setChecking]=useState(true),[busy,setBusy]=useState(false)
  const [reason,setReason]=useState(''),[description,setDescription]=useState(''),[error,setError]=useState('')
  useEffect(()=>{setOpen(false);setReason('');setDescription('');setError('')},[selector])
  const close=()=>{setOpen(false);setReason('');setDescription('');setError('')}
  const submitting=useRef(false),lookupVersion=useRef(0)
  useEffect(()=>{let active=true;const version=++lookupVersion.current;setReport(null);setChecking(true);if(!service)return()=>{active=false};void service.call({action:'transaction-report-status',transaction:selector}).then(value=>{if(active&&version===lookupVersion.current)setReport(value)}).catch(()=>undefined).finally(()=>{if(active&&version===lookupVersion.current)setChecking(false)});return()=>{active=false}},[service,selector])
  if(!service)return null
  const view=()=>{if(report){onClose();service.view(report.id)}}
  const start=async()=>{if(report){view();return}setReason('');setDescription('');setOpen(true);setError('');setChecking(true);const version=++lookupVersion.current;try{const found=await service.call({action:'transaction-report-status',transaction:selector});if(version===lookupVersion.current)setReport(found)}catch(e){setError(e instanceof Error?e.message:'Transaction could not be loaded.')}finally{setChecking(false)}}
  const submit=async()=>{
    if(submitting.current)return;submitting.current=true;++lookupVersion.current;setBusy(true);setError('')
    try{const saved=await service.call({action:'transaction-report',transaction:selector,reason,description:description.trim()});if(!saved)throw Error('Report could not be saved.');setReport(saved)}catch(e){setError(e instanceof Error?e.message:'Report could not be saved. Please try again.')}finally{submitting.current=false;setBusy(false)}
  }
  return <>
    <div className="shrink-0 py-1 text-center"><button type="button" onClick={()=>void start()} className="min-h-10 px-4 text-xs font-medium text-gray-500 dark:text-gray-400">{report?'View report':'Report a problem'}</button></div>
    {open&&<PocketBottomSheet title="Report a problem" layer={160} onClose={close} dismissible={!busy}>
      <h2 className="mb-4 text-center text-base font-bold">{report?'Report submitted':'Report a problem'}</h2>
      {report?<div className="space-y-4 text-center"><p className="text-sm text-gray-500">Your transaction and description are saved for manual review by Pocket Support.</p><p className="text-xs font-mono">Case {report.id}</p><button type="button" onClick={view} className="min-h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">View report in Support</button><button type="button" onClick={close} className="min-h-10 px-4 text-sm">Done</button></div>:<form onSubmit={event=>{event.preventDefault();void submit()}} className="space-y-4">
        <p className="text-xs leading-5 text-gray-500">Tell us what happened. The transaction details will be attached to your report.</p>
        <label className="block text-xs font-semibold">Reason<select aria-label="Reason" required value={reason} onChange={event=>setReason(event.target.value)} disabled={busy} className="mt-2 min-h-12 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal text-gray-950 outline-none focus:border-gray-400 dark:border-[#262626] dark:bg-[#171717] dark:text-white"><option value="">Select a reason</option>{pocketReportReasons.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
        <label className="block text-xs font-semibold">Describe the problem<textarea aria-label="Describe the problem" required minLength={10} maxLength={1500} rows={4} value={description} disabled={busy} onChange={event=>setDescription(event.target.value)} placeholder="Tell us what happened." className="mt-2 w-full resize-none rounded-lg border border-gray-200 bg-white p-3 text-sm font-normal text-gray-950 outline-none placeholder:text-gray-400 focus:border-gray-400 dark:border-[#262626] dark:bg-[#171717] dark:text-white"/></label>
        {error&&<p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={busy||checking||!reason||description.trim().length<10} className="min-h-12 w-full rounded-full bg-gray-950 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">{busy?'Submitting...':'Submit report'}</button>
        <button type="button" disabled={busy} onClick={close} className="min-h-10 w-full text-sm text-gray-500">Cancel</button>
      </form>}
    </PocketBottomSheet>}
  </>
}
