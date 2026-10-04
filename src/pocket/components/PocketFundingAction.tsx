import {QRCodeSVG} from 'qrcode.react'
import {lazy,Suspense,useEffect,useRef,useState,type ReactNode} from 'react'
import {createPortal} from 'react-dom'
import {POCKET_NATIVE_BACK_EVENT} from '../lib/pocketNativeBack'
import type {PocketNetwork} from '../lib/pocketSchemas'
const Deposit=lazy(()=>import('../pages/PocketDepositPage'))

/** Funding never calls the payment action. The parent stays mounted with its draft. */
export default function PocketFundingAction({asset,network,address,locked=false,onReturn,onCancel,children}:{asset:string|null;network:PocketNetwork|'xlayer';address?:string;locked?:boolean;onReturn:()=>Promise<unknown>|unknown;onCancel:()=>void;children:ReactNode}){
 const [open,setOpen]=useState(false),[checking,setChecking]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
 const [target,setTarget]=useState('USDC')
 const root=useRef<HTMLElement>(null),closeRef=useRef<()=>void>(()=>{})
 const close=async()=>{if(checking)return;setChecking(true);setError('');try{await onReturn();setOpen(false)}catch{setError('Could not refresh. Try again.')}finally{setChecking(false)}}
 closeRef.current=()=>{void close()}
 useEffect(()=>{
  if(!open)return
  const previous=document.activeElement as HTMLElement|null,overflow=document.body.style.overflow
  document.body.style.overflow='hidden'
  const topmost=()=>!Array.from(document.querySelectorAll('[data-pocket-sheet]')).some(n=>Number((n.parentElement as HTMLElement)?.style.zIndex)>150)
  if(topmost())root.current?.focus()
  const back=(event:Event)=>{if(!topmost())return;event.preventDefault();event.stopImmediatePropagation();closeRef.current()}
  const key=(event:KeyboardEvent)=>{if(!topmost())return;if(event.key==='Escape'){back(event);return}if(event.key!=='Tab')return;const nodes=Array.from(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]).filter(n=>n.getClientRects().length);const first=nodes[0],last=nodes[nodes.length-1];if(event.shiftKey&&(document.activeElement===first||document.activeElement===root.current)){event.preventDefault();last?.focus()}else if(!event.shiftKey&&(document.activeElement===last||document.activeElement===root.current)){event.preventDefault();first?.focus()}}
  window.addEventListener(POCKET_NATIVE_BACK_EVENT,back,true);document.addEventListener('keydown',key)
  return()=>{window.removeEventListener(POCKET_NATIVE_BACK_EVENT,back,true);document.removeEventListener('keydown',key);document.body.style.overflow=overflow;if(previous?.isConnected)previous.focus()}
 },[open])
 return <>{asset&&!locked?<div><p role="status" className="mb-2 text-center text-xs text-gray-500 dark:text-gray-400">{asset==='OKB'?'Insufficient fee balance':'Insufficient funds'}</p><button type="button" className="pocket-cta-primary w-full" onClick={()=>{setTarget(asset);setCopied(false);setError('');setOpen(true)}}>Add funds</button></div>:children}
 {open&&createPortal(<section data-pocket-colour-scope={network==='xlayer'?'xstocks':'stablecoins'} ref={root} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Add funds" className="fixed inset-0 overflow-y-auto bg-[#F5F5F7] px-4 pb-8 pt-[calc(var(--pocket-safe-top)+1rem)] text-gray-950 dark:bg-black dark:text-white" style={{zIndex:150}}><div className="mx-auto max-w-md">
 {network==='xlayer'?<><h1 className="mb-5 text-center text-lg font-semibold">Deposit {target}</h1><p className="text-center text-sm text-gray-500">X Layer</p>{address&&<div style={{backgroundColor: 'white'}} className="mx-auto mt-6 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={address} size={200}/></div>}<p className="my-5 break-all rounded-2xl bg-white p-4 text-center font-mono text-xs dark:bg-white/5">{address||'Open your X Layer wallet first.'}</p>{address&&<button type="button" className="pocket-cta-primary w-full" onClick={async()=>{try{await navigator.clipboard.writeText(address);setCopied(true)}catch{setError('Could not copy address.')}}}>{copied?'Copied':'Copy deposit address'}</button>}<p className="mt-4 text-center text-xs text-gray-500">Send {target} on X Layer only.</p></>:<Suspense fallback={<p role="status">Opening deposit...</p>}><Deposit initialNetwork={network} initialAsset={target} embedded onBack={()=>void close()}/></Suspense>}
 {error&&<p role="alert" className="mt-4 text-center text-xs text-gray-500">{error}</p>}
 <button type="button" className="pocket-cta-primary mt-6 w-full" disabled={checking} onClick={()=>void close()}>{checking?'Checking balance...':'Return to payment'}</button>
 <button type="button" className="mt-3 min-h-12 w-full text-sm text-gray-500" disabled={checking} onClick={()=>{setOpen(false);onCancel()}}>Cancel payment</button>
 </div></section>,document.body)}</>
}
