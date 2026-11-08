import {useEffect,useState} from 'react'
import {useNavigate,useInRouterContext} from 'react-router-dom'
import {pocketApiUrl,POCKET_BASE_PATH,isPocketNativeRuntime} from '../lib/pocketRoutes'
import type {CheckoutSelectionView} from '../../lib/checkoutSelection'
import PocketHostedCheckoutChoice from './PocketHostedCheckoutChoice'
type Props={id?:string;busy:boolean;onClose?:()=>void}
export default function PocketCheckoutMethodChange(props:Props){const inRouter=useInRouterContext();return inRouter&&isPocketNativeRuntime()?<NativeMethodChange {...props}/>:null}
function NativeMethodChange({id,busy,onClose}:Props){
 const navigate=useNavigate()
 const [parent,setParent]=useState<{id:string;canChange:boolean}|null>(null),[selection,setSelection]=useState<CheckoutSelectionView|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
 useEffect(()=>{setParent(null);setSelection(null);if(!id||!/^chk(?:b|x)?_[a-zA-Z0-9]{8,40}$/.test(id)||!isPocketNativeRuntime())return;const controller=new AbortController();void fetch(pocketApiUrl('/api/v2/checkouts?id='+encodeURIComponent(id)+'&purpose=selection'),{cache:'no-store',signal:controller.signal}).then(r=>r.json()).then(data=>{if(!controller.signal.aborted&&data.ok&&/^chks_[a-f0-9]{24}$/.test(data.selection?.id))setParent(data.selection)}).catch(()=>{});return()=>controller.abort()},[id])
 async function open(){if(!parent||busy||loading)return;setLoading(true);setError('');try{const r=await fetch(pocketApiUrl('/api/v2/checkouts?id='+encodeURIComponent(parent.id)),{cache:'no-store',signal:AbortSignal.timeout(15000)});const d=await r.json();if(!r.ok||!d.ok||d.checkout?.id!==parent.id||!d.checkout?.canChange)throw Error('This payment can no longer be changed. Reopen checkout to check its status.');setSelection(d.checkout)}catch(e){setError((e as Error).message)}finally{setLoading(false)}}
 if(!parent?.canChange)return null
 return <><button type="button" disabled={busy||loading} aria-busy={loading} onClick={()=>void open()} className="mt-2 flex min-h-11 w-full items-center justify-center gap-2 text-xs font-medium">{loading&&<span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"/>}Change payment method</button>{error&&<p role="alert" className="text-center text-xs text-gray-500">{error}</p>}{selection&&<PocketHostedCheckoutChoice checkout={selection} initialMethods onBack={()=>setSelection(null)} onClose={()=>{setSelection(null);if(onClose)onClose();else navigate(POCKET_BASE_PATH+'/home',{replace:true})}} onSelected={path=>{setSelection(null);navigate(POCKET_BASE_PATH+'/home/checkout?code='+encodeURIComponent('https://app.hashpaylink.com'+path),{replace:true})}}/>}</>
}
