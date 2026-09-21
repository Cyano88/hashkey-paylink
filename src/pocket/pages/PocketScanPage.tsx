import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeft } from '../components/PocketIcons'
import { parsePocketScanCode } from '../lib/pocketScanCode'
import { pocketApiUrl, POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
const PaymentPage=lazy(()=>import('../../pages/PaymentPage'))
export default function PocketScanPage() {
 const navigate=useNavigate(),location=useLocation()
 const [checkout,setCheckout]=useState<{params:string;merchant:string;settlement:string}|null>(null)
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[camera,setCamera]=useState(false),[pasted,setPasted]=useState('')
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),timer=useRef<number|undefined>(undefined),generation=useRef(0),pending=useRef(false),abort=useRef<AbortController|null>(null)
 const stop=()=>{generation.current++;window.clearTimeout(timer.current);stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;if(video.current)video.current.srcObject=null;setCamera(false)}
 const open=async(raw:string)=>{
  if(pending.current)return
  pending.current=true;stop();setBusy(true);setError('');abort.current?.abort();const controller=new AbortController();abort.current=controller
  try {
   const code=parsePocketScanCode(raw)
   const path=code.kind==='pos'?'/api/ng-pos?view=pocket-scan&merchant_id='+encodeURIComponent(code.id)+'&code='+encodeURIComponent(code.url):'/api/v2/checkouts?id='+encodeURIComponent(code.id)+'&attempt='+encodeURIComponent(code.attempt)
   const response=await fetch(pocketApiUrl(path),{cache:'no-store',signal:controller.signal})
   const data=await response.json()
   if(!response.ok||data.ok!==true||typeof data.paymentUrl!=='string'||!data.paymentUrl.startsWith('/pay?'))throw Error(typeof data.error==='string'?data.error:'This checkout is unavailable.')
   if(code.kind==='checkout'&&['paid','failed','expired'].includes(data.checkout?.status))throw Error('This checkout is already closed. Do not pay it again.')
   const params=new URLSearchParams(data.paymentUrl.slice(5))
   if(code.kind==='pos'&&(params.get('merchant')!==code.id||params.get('src')!=='ngpos'))throw Error('Merchant verification did not match.')
   if(code.kind==='checkout'&&params.get('checkout')!==code.id)throw Error('Checkout verification did not match.')
   if(!controller.signal.aborted)setCheckout({params:params.toString(),merchant:data.merchantName||data.checkout?.merchantName||'Merchant checkout',settlement:data.settlement||data.checkout?.settlementMode||'USDC'})
  }catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Checkout could not be opened.')}
  finally{if(!controller.signal.aborted){pending.current=false;setBusy(false)}}
 }
 const start=async()=>{
  stop();setError('');const current=generation.current
  try {
   if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera is unavailable. Paste the checkout link below.')
   const media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}}})
   if(current!==generation.current){media.getTracks().forEach(t=>t.stop());return}
   stream.current=media;setCamera(true)
   const element=video.current;if(!element)throw Error('Camera could not open.')
   element.srcObject=media;await element.play()
   const {default:decode}=await import('jsqr')
   const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true})
   if(!context)throw Error('Camera could not open.')
   const tick=()=>{
    if(current!==generation.current)return
    try {
    if(element.readyState>=2&&element.videoWidth){
     const scale=Math.min(1,720/element.videoWidth);canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(element.videoHeight*scale)
     context.drawImage(element,0,0,canvas.width,canvas.height)
     const pixels=context.getImageData(0,0,canvas.width,canvas.height),code=decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})
     if(code){void open(code.data);return}
    }
    timer.current=window.setTimeout(tick,250)
    }catch{stop();setError('Camera could not read this frame. Reopen the camera or paste the checkout link.')}
   };tick()
  }catch(reason){if(current===generation.current){stop();setError(reason instanceof DOMException&&reason.name==='NotAllowedError'?'Camera access was denied. Allow it in app settings or paste the checkout link below.':reason instanceof Error?reason.message:'Camera could not open.')}}
 }
 useEffect(()=>{
  const code=new URLSearchParams(location.search).get('code');setCheckout(null);pending.current=false
  if(code)void open(code)
  else void start()
  return()=>{stop();abort.current?.abort();pending.current=false}
 },[location.search])
 useEffect(()=>{const hide=()=>{if(document.visibilityState!=='visible')stop()};document.addEventListener('visibilitychange',hide);return()=>document.removeEventListener('visibilitychange',hide)},[])
 const back=()=>{stop();abort.current?.abort();navigate(POCKET_BASE_PATH+POCKET_ROUTES.home,{replace:true})}
 return <main className='fixed inset-0 z-[60] overflow-y-auto bg-[#F5F5F7] px-5 pb-[max(2rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))] text-gray-950 dark:bg-black dark:text-white'>
  <div className='mx-auto w-full max-w-[480px]'>
   <header className='mb-5 flex h-12 items-center justify-between'><button type='button' aria-label='Back to Pocket' onClick={back} className='flex h-11 w-11 items-center justify-center rounded-full bg-white dark:bg-white/10'><ArrowLeft className='h-5 w-5'/></button><h1 className='text-sm font-black'>{checkout?'Review payment':'Scan to pay'}</h1><span className='w-11'/></header>
   {checkout?<section aria-label='Payment review'><Suspense fallback={<p role='status'>Opening payment review...</p>}><PaymentPage key={checkout.params} pocketScan={{params:checkout.params,onBack:back}}/></Suspense></section>:<>
    <p className='mb-4 text-center text-sm text-gray-500'>Scan a Hash PayLink merchant or checkout QR.</p>
    <div className='relative aspect-square overflow-hidden rounded-[26px] bg-gray-950'><video ref={video} muted playsInline aria-label='QR camera preview' className='h-full w-full object-cover'/><div aria-hidden='true' className='pointer-events-none absolute inset-12 rounded-2xl border-2 border-white/70'/>{!camera&&<p className='absolute inset-x-4 top-1/2 text-center text-sm text-white/70'>Point your camera at a merchant QR.</p>}</div>
    {busy?<p role='status' className='mt-4 text-center text-sm'>Verifying checkout...</p>:<button type='button' onClick={()=>camera?stop():void start()} className='mt-4 min-h-12 w-full rounded-full bg-gray-950 text-sm font-bold text-white dark:bg-white dark:text-gray-950'>{camera?'Stop camera':'Open camera'}</button>}
    {error&&<p role='alert' className='mt-4 text-sm leading-6 text-red-500'>{error}</p>}
    <form className='mt-6' onSubmit={event=>{event.preventDefault();void open(pasted)}}><label htmlFor='checkout-link' className='text-xs font-semibold text-gray-500'>Or paste a checkout link</label><input id='checkout-link' type='url' required maxLength={4096} value={pasted} onChange={e=>setPasted(e.target.value)} disabled={busy} className='mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm dark:border-[#262626] dark:bg-white/5'/><button type='submit' disabled={busy||!pasted.trim()} className='mt-2 min-h-11 w-full text-sm font-bold disabled:opacity-40'>Review checkout</button></form>
    <p className='mt-4 text-center text-xs leading-5 text-gray-400'>Review the merchant and amount before approving. Scanning never sends money.</p>
   </>}
  </div>
 </main>
}
