import {useEffect,useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
type Grant={email:string;workspaceId:string;roles?:string[];sections?:string[]}
type History={email:string;workspaceId:string;roles:string[];actor:string;at:string}
const labels:Record<string,string>={engineering:'Engineering',compliance:'Compliance',support:'Customer support'}
export default function OperationsTeamPanel({workspaces}:{workspaces:Array<{id:string;name:string}>}){
  const {getAccessToken}=usePrivy()
  const [grants,setGrants]=useState<Grant[]>([]),[history,setHistory]=useState<History[]>([]),[owners,setOwners]=useState<string[]>([])
  const [email,setEmail]=useState(''),[workspaceId,setWorkspace]=useState(workspaces[0]?.id??''),[roles,setRoles]=useState<string[]>([])
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
  const mounted=useRef(true),lock=useRef(false)
  async function api(body?:object){const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.');const response=await fetch('/api/operations-team',{method:body?'PUT':'GET',headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Team access could not be loaded.');return data}
  async function load(){try{const data=await api();if(mounted.current){setGrants(data.grants);setHistory(data.history);setOwners(data.owners)}}catch(e){if(mounted.current)setError((e as Error).message)}finally{if(mounted.current)setLoading(false)}}
  useEffect(()=>{mounted.current=true;void load();return()=>{mounted.current=false}},[]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save(grant:Grant){if(lock.current)return;lock.current=true;setBusy(true);setError('');setNotice('');try{await api(grant);if(mounted.current){setNotice(grant.roles?.length?'Access saved. The team member can sign in with this email.':'Access revoked for this workspace.');await load()}}catch(e){if(mounted.current)setError((e as Error).message)}finally{lock.current=false;if(mounted.current)setBusy(false)}}
  const available=workspaceId==='pocket'?['engineering','support']:['engineering','compliance']
  const field='mt-2 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 text-sm dark:border-white/10'
  if(loading)return <div role="status" aria-label="Loading team" className="h-64 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>
  return <section className="max-w-3xl">
    <h1 className="text-2xl font-semibold">Team access</h1><p className="mt-2 text-sm text-gray-500">Assign access by product. Only owners can change permissions.</p>
    <div className="mt-5 text-sm text-gray-500">Owners: {owners.join(', ')}</div>
    <form className="mt-8 rounded-2xl border border-gray-200 p-5 dark:border-white/10" onSubmit={e=>{e.preventDefault();void save({email,workspaceId,roles})}}>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block text-sm">Work email<input type="email" required maxLength={254} value={email} onChange={e=>{setEmail(e.target.value);setNotice('')}} className={field}/></label>
        <label className="block text-sm">Product<select value={workspaceId} onChange={e=>{setWorkspace(e.target.value);setRoles([]);setNotice('');setError('')}} className={field}>{workspaces.map(w=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
        <div className="flex flex-wrap gap-5">{available.map(role=><label key={role} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={roles.includes(role)} onChange={e=>setRoles(e.target.checked?[...roles,role]:roles.filter(r=>r!==role))}/>{labels[role]}</label>)}</div>
        <p className="text-xs leading-5 text-gray-500">Engineering handles technical operations. Compliance manages app approval. Support handles customer cases. Existing access for this product will be replaced.</p>
        <button disabled={!roles.length||!workspaceId} className="developer-primary">{busy?'Saving…':'Save access'}</button>
      </fieldset>
    </form>
    {error&&<p role="alert" className="mt-4 text-sm text-red-600">{error}<button type="button" className="ml-2 underline" disabled={busy} onClick={()=>{setError('');void load()}}>Reload</button></p>}
    {notice&&<p role="status" className="mt-4 text-sm text-gray-500">{notice}</p>}
    <div className="mt-8 divide-y divide-gray-200 dark:divide-white/10">{grants.map(g=><div key={g.email+':'+g.workspaceId} className="flex items-center justify-between gap-4 py-4"><div className="min-w-0"><p className="break-all text-sm font-medium">{g.email}</p><p className="mt-1 text-xs text-gray-500">{workspaces.find(w=>w.id===g.workspaceId)?.name??g.workspaceId} · {g.roles?.map(r=>labels[r]).join(', ')??'Custom access'}</p></div><button type="button" disabled={busy} className="min-h-11 text-sm text-red-600" onClick={()=>{if(window.confirm(`Revoke ${g.email}'s access to this product?`))void save({email:g.email,workspaceId:g.workspaceId,roles:[]})}}>Revoke</button></div>)}</div>
    {!grants.length&&<p className="mt-5 text-sm text-gray-500">No team access assigned yet.</p>}
    <details className="mt-8"><summary className="cursor-pointer text-sm font-medium">Access history</summary><div className="mt-4 space-y-4">{history.map((h,i)=><p key={i} className="break-words text-xs leading-5 text-gray-500">{h.actor} {h.roles.length?'updated':'revoked'} {h.email} · {h.workspaceId}<br/>{new Date(h.at).toLocaleString()}{h.roles.length?' · '+h.roles.map(r=>labels[r]).join(', '):''}</p>)}</div></details>
  </section>
}
