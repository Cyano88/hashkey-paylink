import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {ArrowLeftIcon,ArrowPathIcon,BoltIcon,BoltSlashIcon} from '@heroicons/react/24/outline'
import {POCKET_NATIVE_BACK_EVENT} from '../lib/pocketNativeBack'
import {pocketWalletAddressCode} from '../lib/pocketWalletAddressCode'

export default function PocketAddressScanner({network,onAddress,onClose}:{network:string;onAddress(address:string):void;onClose():void}){
 const [facing,setFacing]=useState<'environment'|'user'>('environment'),[attempt,setAttempt]=useState(0)
 const [error,setError]=useState(''),[ready,setReady]=useState(false),[torch,setTorch]=useState(false),[hasTorch,setHasTorch]=useState(false)
 const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null),back=useRef<HTMLButtonElement>(null)
 const callbacks=useRef({onAddress,onClose});callbacks.current={onAddress,onClose}
 useEffect(()=>{
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  document.body.style.overflow='hidden';back.current?.focus()
  const close=(event:Event)=>{event.preventDefault();callbacks.current.onClose()}
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape')close(event);if(event.key==='Tab'){const buttons=Array.from(back.current?.closest('[role=dialog]')?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]);const first=buttons[0],last=buttons[buttons.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}}
  window.addEventListener(POCKET_NATIVE_BACK_EVENT,close);document.addEventListener('keydown',key)
  return()=>{document.body.style.overflow=overflow;window.removeEventListener(POCKET_NATIVE_BACK_EVENT,close);document.removeEventListener('keydown',key);previous?.isConnected&&previous.focus()}
 },[])
 useEffect(()=>{
  let disposed=false,timer:number|undefined,media:MediaStream|undefined
  const stop=()=>{window.clearTimeout(timer);media?.getTracks().forEach(t=>t.stop());if(stream.current===media)stream.current=null}
  setReady(false);setError('');setTorch(false);setHasTorch(false)
  const start=async()=>{
   try{
    if(!navigator.mediaDevices?.getUserMedia)throw Error('Camera is unavailable. Go back and paste the address.')
    media=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:facing},width:{ideal:1280},height:{ideal:720}}})
    if(disposed){stop();return}stream.current=media
    const element=video.current;if(!element)throw Error('Camera could not open.')
    element.srcObject=media;await element.play()
    if(disposed){stop();return}
    setHasTorch(Boolean((media.getVideoTracks()[0]?.getCapabilities() as MediaTrackCapabilities&{torch?:boolean})?.torch));setReady(true)
    const {default:decode}=await import('jsqr')
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d',{willReadFrequently:true})
    if(!context)throw Error('Camera could not open.')
    const tick=()=>{
     if(disposed)return
     try{
     if(element.readyState>=2&&element.videoWidth){
      const scale=Math.min(1,720/element.videoWidth);canvas.width=Math.round(element.videoWidth*scale);canvas.height=Math.round(element.videoHeight*scale);context.drawImage(element,0,0,canvas.width,canvas.height)
      const pixels=context.getImageData(0,0,canvas.width,canvas.height),code=decode(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'})
      if(code){try{const address=pocketWalletAddressCode(code.data,network);disposed=true;stop();callbacks.current.onAddress(address);return}catch(reason){setError(reason instanceof Error?reason.message:'Use a valid wallet address.')}}
     }
     timer=window.setTimeout(tick,200)
     }catch{stop();setReady(false);setError('Camera interrupted. Open it again, or paste the address.')}
    };tick()
   }catch(reason){if(!disposed){stop();setReady(false);setError(reason instanceof DOMException&&reason.name==='NotAllowedError'?'Allow camera access in app settings, or go back and paste the address.':reason instanceof Error?reason.message:'Camera could not open.')}}
  }
  void start()
  const hide=()=>{if(document.visibilityState==='hidden'){disposed=true;stop();callbacks.current.onClose()}}
  document.addEventListener('visibilitychange',hide)
  return()=>{disposed=true;stop();document.removeEventListener('visibilitychange',hide)}
 },[facing,attempt,network])
 const toggleTorch=async()=>{try{await stream.current?.getVideoTracks()[0]?.applyConstraints({advanced:[{torch:!torch} as MediaTrackConstraintSet]});setTorch(!torch)}catch{setError('Flash is unavailable on this camera.')}}
 return createPortal(<section role="dialog" aria-modal="true" aria-label="Scan wallet address" className="fixed inset-0 z-[220] flex flex-col bg-black text-white" style={{paddingTop:'var(--pocket-safe-top)',paddingBottom:'var(--pocket-safe-bottom)'}}>
  <header className="flex h-16 shrink-0 items-center gap-3 px-4"><button ref={back} type="button" aria-label="Back to send" onClick={onClose} className="flex h-11 w-11 items-center justify-center"><ArrowLeftIcon className="h-5 w-5"/></button><h2 className="text-base font-semibold">Scan QR code</h2></header>
  <div className="relative min-h-0 flex-1 overflow-hidden bg-[#181818]"><video ref={video} muted playsInline aria-label="Wallet QR camera" className="h-full w-full object-cover" style={facing==='user'?{transform:'scaleX(-1)'}:undefined}/>
   <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center"><div className="relative aspect-square w-[72%] max-w-sm rounded-3xl shadow-[0_0_0_100vmax_rgba(0,0,0,0.28)]">{['top-0 left-0 border-t-4 border-l-4 rounded-tl-2xl','top-0 right-0 border-t-4 border-r-4 rounded-tr-2xl','bottom-0 left-0 border-b-4 border-l-4 rounded-bl-2xl','bottom-0 right-0 border-b-4 border-r-4 rounded-br-2xl'].map(c=><span key={c} className={'absolute h-9 w-9 border-white/90 '+c}/>)}</div></div>
   {!ready&&!error&&<div role="status" aria-label="Opening camera" className="pocket-shimmer absolute inset-0 bg-white/5"/>}
  </div>
  <footer className="shrink-0 px-8 pb-5 pt-4">{error&&<p role="status" className="mb-3 text-center text-sm text-white/75">{error}</p>}{!ready&&error&&<button type="button" onClick={()=>setAttempt(a=>a+1)} className="mb-3 min-h-11 w-full text-sm">Open camera</button>}<div className="mx-auto flex max-w-xs items-center justify-between"><button type="button" aria-label={torch?'Turn flash off':'Turn flash on'} aria-pressed={torch} disabled={!hasTorch||!ready} onClick={()=>void toggleTorch()} className="flex h-12 w-12 items-center justify-center disabled:opacity-35">{torch?<BoltIcon className="h-6 w-6"/>:<BoltSlashIcon className="h-6 w-6"/>}</button><button type="button" aria-label={facing==='environment'?'Switch to front camera':'Switch to rear camera'} onClick={()=>setFacing(f=>f==='environment'?'user':'environment')} className="flex h-12 w-12 items-center justify-center"><ArrowPathIcon className="h-6 w-6"/></button></div></footer>
 </section>,document.body)
}
