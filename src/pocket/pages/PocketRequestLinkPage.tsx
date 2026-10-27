import {useEffect,useRef,useState} from 'react'
import {useNavigate,useParams} from 'react-router-dom'
import usePocketIdentity from '../hooks/usePocketIdentity'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketBottomSheet from '../components/PocketBottomSheet'
import PocketEmailLogin from '../components/PocketEmailLogin'
import PocketGetApp from '../components/PocketGetApp'
import {claimPocketLinkRequest} from '../api/pocketRequestsClient'
import {isPocketNativeRuntime,pocketApiUrl} from '../lib/pocketRoutes'
type Preview={senderName:string;senderPocketId:string;title:string;amount:string;network:string;status:string}
export default function PocketRequestLinkPage(){
 const {code=''}=useParams(),navigate=useNavigate(),identity=usePocketIdentity(),native=isPocketNativeRuntime()
 const [preview,setPreview]=useState<Preview|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[login,setLogin]=useState(false),[install,setInstall]=useState(false),[retry,setRetry]=useState(0)
 const locked=useRef(false)
 useEffect(()=>{
  let active=true,running=false,controller=new AbortController()
  setPreview(null);setError('')
  const read=async()=>{if(running||document.visibilityState==='hidden')return;running=true;controller=new AbortController();const timeout=window.setTimeout(()=>controller.abort(),12000)
   try{if(!/^[A-Za-z0-9_-]{32}$/.test(code))throw Error('This request link is invalid.');const response=await fetch(pocketApiUrl('/api/pocket/requests?link='+encodeURIComponent(code)),{signal:controller.signal,cache:'no-store'}),data=await response.json();if(!response.ok||!data.ok||!data.preview)throw Error(data.error?.message||'This request is unavailable.');if(active){setPreview(data.preview);setError('')}}catch(reason){if(active)setError(controller.signal.aborted?'Could not load this request. Try again.':reason instanceof Error?reason.message:'This request is unavailable.')}finally{window.clearTimeout(timeout);running=false}}
  void read();const timer=window.setInterval(read,15000);document.addEventListener('visibilitychange',read)
  return()=>{active=false;controller.abort();window.clearInterval(timer);document.removeEventListener('visibilitychange',read)}
 },[code,retry])
 useEffect(()=>{if(identity.authenticated)setLogin(false)},[identity.authenticated])
 const openApp=()=>{setInstall(true);window.location.href='https://pocket.hashpaylink.com/request/'+encodeURIComponent(code)}
 const proceed=async()=>{
  if(!native){openApp();return}if(!identity.authenticated){setLogin(true);return}if(locked.current)return
  locked.current=true;setBusy(true);setError('')
  try{const token=await identity.getAccessToken();if(!token)throw Error('Sign in to continue.');const request=await claimPocketLinkRequest(token,code);if(request.status==='paid'){setPreview(old=>old?{...old,status:'paid'}:old);return}navigate(request.paymentPath)}catch(reason){setError(reason instanceof Error?reason.message:'Could not open this request.')}finally{locked.current=false;setBusy(false)}
 }
 const closed=preview&&['paid','cancelled','declined'].includes(preview.status)
 return <main className="mx-auto flex min-h-[100dvh] max-w-md flex-col bg-[#F5F5F7] px-6 pb-[max(1.5rem,var(--pocket-safe-bottom))] pt-[calc(var(--pocket-safe-top)+1rem)] text-gray-950 dark:bg-black dark:text-white"><PocketFlowHeader centered title="Payment request" onBack={()=>native?navigate('/home'):window.history.back()}/><div className="flex flex-1 flex-col justify-center py-8">{preview?<><p className="text-center text-sm text-gray-500">{preview.senderName}</p><h1 className="mt-3 text-center text-3xl font-semibold">{preview.amount} USDC</h1>{preview.title!=='Payment request'&&<p className="mt-3 text-center text-sm text-gray-500">{preview.title}</p>}{closed&&<p role="status" className="mt-6 text-center text-sm font-medium">{preview.status==='paid'?'Paid':preview.status==='cancelled'?'Request cancelled':'Request declined'}</p>}</>:!error?<div role="status" aria-label="Opening payment request" className="space-y-4"><div className="pocket-shimmer mx-auto h-4 w-28 rounded bg-gray-200 dark:bg-white/10"/><div className="pocket-shimmer mx-auto h-10 w-44 rounded bg-gray-200 dark:bg-white/10"/></div>:null}</div>{error&&<p role="status" className="mb-3 text-center text-sm text-gray-500">{error}</p>}{preview&&!closed&&<button type="button" disabled={busy||native&&!identity.ready} onClick={()=>void proceed()} className="pocket-cta-primary w-full">{native?'Review payment':'Open in Pocket'}</button>}{!preview&&error&&<button type="button" onClick={()=>setRetry(v=>v+1)} className="pocket-cta-primary w-full">Try again</button>}
 {login&&!identity.authenticated&&<PocketBottomSheet title="Sign in to Pocket" onClose={()=>setLogin(false)} dismissOnBackdrop={false}><PocketEmailLogin/></PocketBottomSheet>}{install&&<PocketBottomSheet title="Open in Pocket" onClose={()=>setInstall(false)}><p className="text-center text-sm text-gray-500">After installing Pocket, reopen this request link to pay.</p><PocketGetApp/><button type="button" className="pocket-cta-primary mt-5 w-full" onClick={openApp}>Open Pocket</button></PocketBottomSheet>}</main>
}
