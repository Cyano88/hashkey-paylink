import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePrivy } from '@privy-io/react-auth'
import { UserRound, X, LogOut } from 'lucide-react'

export default function AccountMenu({onLogout,profileSwitcher}:{onLogout:()=>Promise<void>;profileSwitcher?:React.ReactNode}) {
  const {getAccessToken} = usePrivy()
  const dialog = useRef<HTMLDialogElement>(null)
  const [open,setOpen]=useState(false)
  const [profile,setProfile]=useState({name:'',role:'',email:''})
  const [loading,setLoading]=useState(false)
  const [saving,setSaving]=useState(false)
  const [error,setError]=useState('')
  const [loaded,setLoaded]=useState(false)
  const [saved,setSaved]=useState(false)
  const lock=useRef(false)
  async function request(method:string,body?:object) {
    const token=await getAccessToken()
    if(!token)throw Error('Sign in again to continue.')
    const response=await fetch('/api/developer-projects?resource=profile',{method,headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},cache:'no-store',signal:AbortSignal.timeout(15000),...(body?{body:JSON.stringify(body)}:{})})
    const data=await response.json()
    if(!response.ok||!data.ok)throw Error(data.error||'Your profile could not be saved.')
    return {name:data.profile?.name||'',role:data.profile?.role||'',email:data.profile?.email||''}
  }
  useEffect(()=>{
    if(!open)return
    dialog.current?.showModal()
    let cancelled=false
    setLoading(true);setLoaded(false);setError('');setSaved(false)
    request('GET').then(value=>{if(!cancelled){setProfile(value);setLoaded(true)}}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)})
    return ()=>{cancelled=true;dialog.current?.close()}
  },[open]) // eslint-disable-line react-hooks/exhaustive-deps
  async function save(event:React.FormEvent) {
    event.preventDefault()
    if(lock.current||!loaded)return
    lock.current=true;setSaving(true);setError('');setSaved(false)
    try{const savedProfile=await request('PUT',{action:'update-profile',name:profile.name,role:profile.role});setProfile(savedProfile);window.dispatchEvent(new CustomEvent('developer-profile-updated',{detail:savedProfile}));setSaved(true)}
    catch(e){setError(e instanceof Error?e.message:'Profile could not be saved.')}
    finally{lock.current=false;setSaving(false)}
  }
  const content=<div className="flex items-center gap-2">
    {profileSwitcher}
    <button type="button" aria-label="Your profile" onClick={()=>setOpen(true)} className="grid h-11 w-11 place-items-center rounded-full text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><UserRound className="h-5 w-5"/></button>
    <button type="button" onClick={()=>void onLogout()} className="inline-flex min-h-11 items-center gap-2 text-xs font-medium text-gray-500"><LogOut className="h-4 w-4"/><span className="hidden md:inline">Sign out</span><span className="sr-only md:hidden">Sign out</span></button>
    {open&&<dialog ref={dialog} aria-labelledby="profile-title" onCancel={e=>{if(saving)e.preventDefault()}} onClose={()=>setOpen(false)} className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-gray-950 backdrop:bg-black/40 dark:border-white/10 dark:bg-[#101114] dark:text-white">
      <div className="flex items-center justify-between"><h2 id="profile-title" className="text-xl font-semibold">Your profile</h2><button type="button" disabled={saving} onClick={()=>setOpen(false)} aria-label="Close profile" className="grid h-11 w-11 place-items-center"><X className="h-5 w-5"/></button></div>
      {loading?<div aria-label="Loading profile" role="status" className="mt-6 h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>:<form onSubmit={save} className="mt-5 space-y-4">
        <fieldset disabled={saving||!loaded} className="space-y-4">
          <label className="block text-sm">Full name<input required minLength={2} maxLength={100} autoComplete="name" value={profile.name} onChange={e=>{setSaved(false);setProfile({...profile,name:e.target.value})}} className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10"/></label>
          <label className="block text-sm">Role <span className="text-gray-400">(optional)</span><input maxLength={100} autoComplete="organization-title" value={profile.role} onChange={e=>{setSaved(false);setProfile({...profile,role:e.target.value})}} className="mt-2 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10"/></label>
          <p className="break-all text-sm text-gray-500">{profile.email}</p>
        </fieldset>
        {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
        {saved&&<p role="status" className="text-sm text-emerald-600">Profile saved.</p>}
        <button disabled={saving||!loaded} className="developer-primary w-full">{saving?'Saving…':'Save changes'}</button>
      </form>}
    </dialog>}
  </div>
  const target=document.getElementById('developer-account-menu')
  return target?createPortal(content,target):content
}
