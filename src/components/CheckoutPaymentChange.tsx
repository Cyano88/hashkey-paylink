import {useEffect,useState} from 'react'
import {useNavigate,useInRouterContext} from 'react-router-dom'

export default function CheckoutPaymentChange({id,busy}:{id:string;busy:boolean}){
 return useInRouterContext()?<PaymentChange id={id} busy={busy}/>:null
}
function PaymentChange({id,busy}:{id:string;busy:boolean}){
 const navigate=useNavigate()
 const [selection,setSelection]=useState<{id:string;canChange:boolean}|null>(null)
 useEffect(()=>{
  setSelection(null)
  if(!/^chk(?:b|x)?_[a-zA-Z0-9]{8,40}$/.test(id))return
  const abort=new AbortController()
  void fetch('/api/v2/checkouts?id='+encodeURIComponent(id)+'&purpose=selection',{cache:'no-store',signal:abort.signal})
   .then(async response=>{if(!response.ok)return;const body=await response.json();if(!abort.signal.aborted&&body.ok&&/^chks_[a-f0-9]{24}$/.test(body.selection?.id))setSelection(body.selection)})
   .catch(()=>{})
  return()=>abort.abort()
 },[id])
 if(!selection?.canChange)return null
 return <button type="button" disabled={busy} onClick={()=>navigate('/pay/c/'+selection.id+'?browser=1&change=1')} className="mt-3 min-h-11 w-full text-xs font-medium disabled:opacity-50">Change payment network</button>
}
