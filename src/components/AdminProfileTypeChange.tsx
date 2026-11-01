import {useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {builderCountryName} from '../lib/builderCountries'
type Target={id:string;name:string;fullName?:string;country?:string;type:'individual'|'business';ready:boolean}
export default function AdminProfileTypeChange({projectId,workspaceId,onChanged}:{projectId:string;workspaceId:string;onChanged:()=>Promise<void>}){
 const {getAccessToken}=usePrivy(),lock=useRef(false)
 const [options,setOptions]=useState<{profiles:Target[];updatedAt:string}>(),[target,setTarget]=useState(''),[reason,setReason]=useState(''),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 async function request(action:string,extra:Record<string,unknown>={}){const token=await getAccessToken();if(!token)throw Error('Sign in again.');const response=await fetch('/api/developer-projects?'+new URLSearchParams({workspace:workspaceId}),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action,projectId,...extra}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'The profile could not be changed.');return data}
 async function run(change=false){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{if(change){await request('admin-change-profile',{targetProfileId:target,expectedUpdatedAt:options?.updatedAt,reason,confirmPause:confirmed});setOptions(undefined);setTarget('');setReason('');setConfirmed(false);setNotice('Profile changed. New payments are paused pending verification and receiving-account review.');window.dispatchEvent(new Event('operations-attention-changed'));await onChanged()}else{setOptions(await request('admin-profile-options'));setTarget('');setConfirmed(false)}}catch(e){setError((e as Error).message)}finally{lock.current=false;setBusy(false)}}
 const selected=options?.profiles.find(p=>p.id===target)
 const field='mt-2 min-h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-white/10'
 return <section className="mt-6 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
  <h2 className="text-sm font-semibold">Profile type</h2>
  <p className="mt-2 text-sm leading-6 text-gray-500">Move this app between its owner's Personal and Business profiles. Keep the app, API keys, webhooks and payment history. Other apps stay in their current profile.</p>
  {!options?<button disabled={busy} onClick={()=>void run()} className="developer-primary mt-4">{busy?'Opening…':'Change profile type'}</button>:<form className="mt-4 space-y-4" onSubmit={e=>{e.preventDefault();void run(true)}}>
   <label className="block text-sm">Destination profile<select className={field} value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setConfirmed(false)}} required><option value="">Choose a profile</option>{options.profiles.map(p=><option key={p.id} value={p.id} disabled={!p.ready}>{p.type==='individual'?'Personal':p.name}{p.country?' · '+builderCountryName(p.country):''}{!p.ready?' · Setup required':''}</option>)}</select></label>
   {!options.profiles.some(p=>p.ready)&&<p className="text-sm text-gray-500">The builder must complete the destination profile's name and country in the developer portal first. They do not need to create another app.</p>}
   {selected&&<p className="text-sm text-gray-500">{selected.type==='individual'?selected.fullName:selected.name} · {builderCountryName(selected.country||'')}. {selected.type==='business'&&selected.country==='NG'?'New human checkout orders will require NGN pricing. Update the integration before reactivation.':''}</p>}
   <label className="block text-sm">Reason<textarea className={field} value={reason} onChange={e=>setReason(e.target.value)} minLength={12} maxLength={500} required disabled={busy} placeholder="Record the builder's request and why the profile type is changing."/></label>
   <p className="text-sm leading-6 text-gray-500">Previous verification remains in the audit record. KYC/KYB approval does not transfer. New payments pause until verification and receiving details are reviewed; local receiving accounts must be saved and verified again.</p>
   <label className="flex items-start gap-3 text-sm leading-6"><input className="mt-1" type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)} required/>I have confirmed the builder's request and understand that new payments will pause.</label>
   <div className="flex flex-wrap gap-3"><button className="developer-primary" disabled={busy||!selected?.ready||!confirmed||reason.trim().length<12}>{busy?'Saving…':'Change profile and pause payments'}</button><button type="button" className="px-3 text-sm" disabled={busy} onClick={()=>{setOptions(undefined);setError('')}}>Cancel</button></div>
  </form>}
  {error&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}{notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
 </section>
}
