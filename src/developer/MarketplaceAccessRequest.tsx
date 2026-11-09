import {useEffect,useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'

export default function MarketplaceAccessRequest({projectId}:{projectId:string}){
 const {getAccessToken}=usePrivy(),[email,setEmail]=useState(''),[status,setStatus]=useState(''),[note,setNote]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[reload,setReload]=useState(0),version=useRef(0),submitting=useRef(false)
 useEffect(()=>{
  const current=++version.current,controller=new AbortController()
  setLoading(true);setError('');setStatus('');setNote('');setEmail('');setSaving(false);submitting.current=false
  void (async()=>{try{const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.');const response=await fetch('/api/marketplace-access?projectId='+encodeURIComponent(projectId),{headers:{authorization:'Bearer '+token},signal:controller.signal});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Unable to load your request.');if(version.current===current){setEmail(data.email||'');setStatus(data.request?.status||'');setNote(data.request?.reviewNote||'')}}catch(e){if(version.current===current&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Unable to load your request.')}finally{if(version.current===current)setLoading(false)}})()
  return()=>{version.current++;controller.abort()}
 },[projectId,getAccessToken,reload])
 async function submit(event:React.FormEvent){
  event.preventDefault();if(submitting.current||loading||status||!email)return
  submitting.current=true;setSaving(true);setError('');const current=version.current
  try{const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.');if(version.current!==current)return
   const response=await fetch('/api/marketplace-access',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({projectId,email}),signal:AbortSignal.timeout(20000)}),data=await response.json()
   if(!response.ok||!data.ok)throw Error(data.error||'Unable to submit your request.')
   if(version.current===current)setStatus(data.request?.status||'pending')
  }catch(e){if(version.current===current)setError(e instanceof Error?e.message:'Unable to submit your request.')}
  finally{if(version.current===current){submitting.current=false;setSaving(false)}}
 }
 return <section aria-label="Marketplace whitelist" className="mt-8 rounded-2xl border border-gray-200 p-5 dark:border-white/10">
  <h2 className="text-base font-semibold">Marketplace Payments early access</h2>
  <p className="mt-2 text-sm leading-6 text-gray-500">Building a multivendor marketplace? Submit your email for whitelist review. Requests do not enable payments or production API access.</p>
  <div className="mt-4 min-h-28" aria-busy={loading||saving}>
   {loading?<p role="status" className="text-sm text-gray-500">Loading your request…</p>:status?<div role="status"><p className="font-medium">{status==='approved'?'Whitelist approved':status==='rejected'?'Request not approved':'Request received - pending review'}</p><p className="mt-2 break-all text-sm text-gray-500">{email}</p><p className="mt-2 text-sm text-gray-500">{status==='approved'?'Your app is approved for the whitelist. Payment activation remains subject to rollout and verification.':status==='rejected'?'Contact support if you need help with this decision.':'Your request is saved for this app. No need to submit again.'}</p>{note&&<p className="mt-2 text-sm">{note}</p>}</div>:email?<form onSubmit={submit}><label className="block text-sm font-medium">Verified email<input type="email" readOnly value={email} className="mt-2 block h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-3 text-sm dark:border-white/10 dark:bg-white/5"/></label><button type="submit" disabled={saving} className="developer-primary mt-4 min-h-11">{saving?'Submitting…':'Request whitelist access'}</button></form>:!error?<p className="text-sm text-gray-500">Link and verify an email with your developer account before requesting access.</p>:null}
  </div>
  {error&&<div className="mt-3"><p role="alert" className="text-sm text-red-600">{error}</p>{!email&&<button type="button" className="mt-2 min-h-11 text-sm underline" onClick={()=>setReload(v=>v+1)}>Try again</button>}</div>}
 </section>
}
