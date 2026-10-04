import {lazy,Suspense,useEffect,useRef,useState} from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import usePocketIdentity from '../hooks/usePocketIdentity'
import {readPocketXPayPayment} from '../api/pocketXPayPaymentClient'
import type {PocketNetwork} from '../lib/pocketSchemas'
import type {XPayDestination} from '../lib/pocketUnifiedXPay'
const Payment=lazy(()=>import('../../pages/PaymentPage').then(m=>({default:m.PocketMerchantPayment})))

/** Resolves verified merchant data in-place; no scan screen or hosted navigation. */
export default function PocketXPayNativePayment({checkoutId,destination,network,onClose}:{checkoutId:string;destination:XPayDestination;network:PocketNetwork;onClose:()=>void}){
 const identity=usePocketIdentity(),owner=useRef(identity.user?.id);owner.current=identity.user?.id
 const [details,setDetails]=useState<{params:string;merchant:string}|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0)
 const alive=useRef(false)
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{const abort=new AbortController();setDetails(null);setError('');void readPocketXPayPayment({checkoutId,destination,network,signal:abort.signal}).then(data=>{if(!abort.signal.aborted)setDetails(data)}).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[checkoutId,destination.id,destination.revision,network,identity.user?.id,retry])
 const verify=async()=>{const expected=identity.user?.id;const fresh=await readPocketXPayPayment({checkoutId,destination,network});if(!alive.current||owner.current!==expected)throw Error('Your Pocket account changed.');if(fresh.params!==details?.params)throw Error('Payment details changed. Reopen XPay.')}
 const loading=<PocketBottomSheet title="XPay" onClose={onClose} showCloseButton dismissOnBackdrop={false}>{error?<><p role="alert" className="py-5 text-center text-sm">{error}</p><button className="pocket-cta-primary w-full" onClick={()=>setRetry(n=>n+1)}>Try again</button></>:<div role="status" aria-label="Preparing payment" className="space-y-4 py-4"><div className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"/><div className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-white/10"/></div>}</PocketBottomSheet>
 return details?<Suspense fallback={loading}><Payment key={identity.user?.id+':'+details.params} params={details.params} merchantName={details.merchant} verify={verify} onBack={onClose}/></Suspense>:loading
}
