import {useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import PocketKycPanel from '../pocket/components/PocketKycPanel'

export function checkoutVerificationLevel(error:unknown):'basic'|'advanced'|null {
 const code=(error as {code?:string})?.code
 return code==='KYC_BASIC_REQUIRED'?'basic':code==='KYC_ADVANCED_REQUIRED'?'advanced':null
}

export default function CheckoutVerification({email,level,expired,onBack,onContinue}:{email:string;level:'basic'|'advanced';expired:boolean;onBack:()=>void;onContinue:()=>Promise<void>}){
 const {getAccessToken,user}=usePrivy()
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function continuePayment(){
  if(busy||expired)return
  setBusy(true);setError('')
  try {
   const token=await getAccessToken()
   if(!token)throw Error('Sign in again to continue.')
   const response=await fetch('/api/pocket/kyc',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({action:'status'}),signal:AbortSignal.timeout(20000)})
   const data=await response.json()
   if(!response.ok||!data.ok)throw Error(data.error||'Could not check verification. Please try again.')
   const actual=data.paymentLevel||data.level
   if(data.environment!=='production'||!(actual==='advanced'||level==='basic'&&actual==='basic'))throw Error('Verification is not complete yet. Finish the checks above, then continue.')
   await onContinue()
  }catch(e){setError(e instanceof Error?e.message:'Could not check verification. Please try again.')}
  finally{setBusy(false)}
 }
 return <section className="mt-5">
  <button type="button" disabled={busy} onClick={onBack} className="min-h-11 text-sm font-medium">← Back to payment</button>
  <h2 className="mt-3 text-xl font-semibold">Verify your identity</h2>
  <p className="mt-2 text-sm leading-6 text-gray-500">Complete the checks here to use this payment method. Your verification is shared with Pocket on the same account.</p>
  <PocketKycPanel key={user?.id} email={email} getAccessToken={getAccessToken} surface="checkout" initialLevel={level}/>
  {expired?<p role="status" className="mt-5 text-sm text-gray-500">This checkout expired. You can finish verification, then return to the store for a new checkout.</p>:<button type="button" disabled={busy} onClick={()=>void continuePayment()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-45 dark:bg-white dark:text-gray-950">{busy?'Checking verification…':'Continue to payment'}</button>}
  {error&&<p role="alert" className="mt-4 text-center text-sm text-gray-500">{error}</p>}
 </section>
}
