import {useRef,useState,type ReactNode} from 'react'
import {useAcceptTerms,usePrivy} from '@privy-io/react-auth'

export default function DeveloperTermsGate({children}:{children:ReactNode}){
 const {ready,authenticated,user,logout}=usePrivy()
 if(!ready||!authenticated||!user||user.hasAcceptedTerms)return <>{children}</>
 return <TermsAcceptance key={user.id} onLogout={logout}/>
}
function TermsAcceptance({onLogout}:{onLogout:()=>Promise<void>}){
 const {acceptTerms}=useAcceptTerms()
 const [checked,setChecked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const pending=useRef(false)
 async function accept(){
  if(!checked||pending.current)return
  pending.current=true;setBusy(true);setError('')
  try{await acceptTerms()}catch{setError('Your agreement could not be saved. Please try again.')}finally{pending.current=false;setBusy(false)}
 }
 return <main id="developer-content" className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-lg items-center px-5 py-12">
  <section className="w-full rounded-2xl border border-gray-200 bg-white p-6 sm:p-8 dark:border-white/10 dark:bg-[#101114]" aria-labelledby="developer-terms-title">
   <h1 id="developer-terms-title" className="text-2xl font-semibold">Before you continue</h1>
   <p className="mt-3 text-sm leading-6 text-gray-500">Review the Hash PayLink terms and privacy policy to finish setting up your account.</p>
   <div className="mt-5 flex flex-wrap gap-4 text-sm"><a href="https://docs.hashpaylink.com/docs/terms" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Terms of service</a><a href="https://docs.hashpaylink.com/docs/privacy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">Privacy policy</a></div>
   <label className="mt-6 flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={checked} disabled={busy} onChange={e=>setChecked(e.target.checked)} className="mt-1 h-4 w-4 shrink-0"/><span>I agree to the Hash PayLink Terms of Service and acknowledge the Privacy Policy.</span></label>
   {error&&<p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
   <button type="button" disabled={!checked||busy} onClick={()=>void accept()} className="developer-primary mt-6 w-full disabled:opacity-40">{busy?'Saving agreement':'Agree and continue'}</button>
   <button type="button" disabled={busy} onClick={()=>void onLogout()} className="mt-3 min-h-11 w-full text-sm text-gray-500">Sign out</button>
  </section>
 </main>
}
