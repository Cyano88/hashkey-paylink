import {useEffect,useRef,useState} from 'react'
import {Building2,UserRound,Plus,X,Check,ChevronDown} from 'lucide-react'
import type {BuilderProfile} from '../lib/builderProfiles'
export default function ProfileSwitcher({profiles,active,disabled,onSelect,onCreate}:{profiles:BuilderProfile[];active:BuilderProfile;disabled:boolean;onSelect:(id:string)=>boolean;onCreate:(name:string)=>Promise<void>}){
 const [menu,setMenu]=useState(false),[creating,setCreating]=useState(false),[name,setName]=useState(''),[saving,setSaving]=useState(false),[error,setError]=useState('')
 const root=useRef<HTMLDivElement>(null),dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),lastBusiness=useRef('')
 const businesses=profiles.filter(p=>p.type==='business')
 useEffect(()=>{if(active.type==='business')lastBusiness.current=active.id;setMenu(false)},[active.id])
 useEffect(()=>{if(!menu)return;const close=(event:PointerEvent)=>{if(!root.current?.contains(event.target as Node))setMenu(false)};document.addEventListener('pointerdown',close);return()=>document.removeEventListener('pointerdown',close)},[menu])
 useEffect(()=>{if(creating)dialog.current?.showModal();return()=>dialog.current?.close()},[creating])
 function add(){setMenu(false);setName('');setError('');setCreating(true)}
 function business(){if(!businesses.length){add();return}if(active.type==='business'){setMenu(v=>!v);return}onSelect(businesses.find(p=>p.id===lastBusiness.current)?.id??businesses[0].id)}
 async function create(event:React.FormEvent){event.preventDefault();if(lock.current)return;lock.current=true;setSaving(true);setError('');try{await onCreate(name.trim());setCreating(false)}catch(e){setError(e instanceof Error?e.message:'Business profile could not be created.')}finally{lock.current=false;setSaving(false)}}
 const button='inline-flex h-10 items-center justify-center gap-2 rounded-lg px-2.5 text-xs font-medium transition disabled:opacity-40 sm:px-3'
 const selected='bg-white text-gray-950 shadow-sm dark:bg-white/10 dark:text-white'
 const idle='text-gray-500 hover:text-gray-950 dark:hover:text-white'
 return <div ref={root} className="relative shrink-0" onKeyDown={e=>{if(e.key==='Escape')setMenu(false)}}>
  <div role="group" aria-label="Active profile" className="inline-flex rounded-xl bg-gray-100 p-1 dark:bg-white/5">
   <button type="button" aria-label="Business profile" aria-pressed={active.type==='business'} title={active.type==='business'?active.name:'Business profile'} disabled={disabled||saving} onClick={business} className={button+' '+(active.type==='business'?selected:idle)}><Building2 className="h-4 w-4"/><span className="hidden md:inline">Business</span>{active.type==='business'&&<ChevronDown className="h-3 w-3"/>}</button>
   <button type="button" aria-label="Personal profile" aria-pressed={active.type==='individual'} title="Personal profile" disabled={disabled||saving} onClick={()=>onSelect('personal')} className={button+' '+(active.type==='individual'?selected:idle)}><UserRound className="h-4 w-4"/><span className="hidden md:inline">Personal</span></button>
  </div>
  {menu&&<div aria-label="Business profiles" className="absolute right-0 top-full z-40 mt-2 max-h-80 w-64 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-gray-200 bg-white p-2 shadow-lg dark:border-white/10 dark:bg-[#17181b]">
   <p className="px-3 py-2 text-xs font-medium text-gray-500">Business profiles</p>
   {businesses.map(p=><button type="button" key={p.id} disabled={disabled} onClick={()=>{if(onSelect(p.id))setMenu(false)}} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-gray-100 dark:hover:bg-white/5"><Building2 className="h-4 w-4 shrink-0"/><span className="min-w-0 flex-1 truncate">{p.name}</span>{p.id===active.id&&<Check className="h-4 w-4 shrink-0"/>}</button>)}
   <button type="button" disabled={disabled} onClick={add} className="mt-1 flex min-h-11 w-full items-center gap-2 border-t border-gray-200 px-3 text-sm dark:border-white/10"><Plus className="h-4 w-4"/>Add business profile</button>
  </div>}
  {creating&&<dialog ref={dialog} onCancel={e=>{if(saving)e.preventDefault()}} onClose={()=>setCreating(false)} aria-labelledby="business-profile-title" className="w-[calc(100%_-_2rem)] max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-gray-950 backdrop:bg-black/40 dark:border-white/10 dark:bg-[#101114] dark:text-white">
   <div className="flex items-center justify-between gap-3"><h2 id="business-profile-title" className="text-xl font-semibold">Add business profile</h2><button type="button" aria-label="Close business profile" disabled={saving} onClick={()=>setCreating(false)} className="grid h-11 w-11 place-items-center"><X className="h-5 w-5"/></button></div>
   <p className="mt-3 text-sm leading-6 text-gray-500">Keep this business's apps and payment settings separate from your personal profile. Creating a profile does not approve its KYB.</p>
   <form onSubmit={create} className="mt-5 space-y-4"><label className="block text-sm">Business profile name<input required minLength={2} maxLength={100} autoFocus disabled={saving} value={name} onChange={e=>setName(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 text-base dark:border-white/10"/></label>{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}<button disabled={saving} className="developer-primary w-full">{saving?'Creating profile':'Create business profile'}</button></form>
  </dialog>}
 </div>
}
