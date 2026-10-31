import {useCallback,useEffect,useRef,useState} from 'react'

import {usePrivy} from '@privy-io/react-auth'

import {useLocation} from 'react-router-dom'
import {ChatBubbleLeftRightIcon,XMarkIcon,PlusIcon} from '@heroicons/react/24/outline'

import {Conversation,type ChatMessage} from './SupportConversation'
import PocketStyleSupportComposer from './PocketStyleSupportComposer'



type Case={id:string;summary:string;status:string;humanSupport:boolean;messages:ChatMessage[]}

function DeveloperSupportChat({visible,onClose}:{visible:boolean;onClose:()=>void}){

 const {ready,authenticated,user,getAccessToken}=usePrivy(),[projects,setProjects]=useState<Array<{id:string;name:string}>>([]),[projectId,setProject]=useState(''),[cases,setCases]=useState<Case[]>([]),[activeId,setActive]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[refreshing,setRefreshing]=useState(false)

 const drafts=useRef<Record<string,string>>({})

 const lock=useRef(false),request=useRef<{id:string;text:string;caseId:string;projectId:string}>(),generation=useRef(0)

 const call=useCallback(async(url:string,body?:object)=>{const token=await getAccessToken();if(!token)throw Error('Sign in to contact support.');const r=await fetch(url,{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok||!d.ok)throw Error(d.error||'Support could not be loaded.');return d},[getAccessToken])

 useEffect(()=>{let live=true;setProjects([]);setProject('');drafts.current={};setCases([]);setActive('');setMessage('');if(!authenticated)return;setLoading(true);void call('/api/developer-projects').then(d=>{if(live){setProjects(d.projects||[]);setProject(d.projects?.find((p:{id:string})=>p.id===new URLSearchParams(window.location.search).get('project'))?.id||d.projects?.[0]?.id||'')}}).catch(e=>{if(live)setError(e.message)}).finally(()=>{if(live)setLoading(false)});return()=>{live=false}},[authenticated,user?.id,call])

 const refresh=useCallback(async()=>{const current=generation.current;try{const d=await call('/api/developer-support?projectId='+encodeURIComponent(projectId));if(current===generation.current){setCases(d.cases);setError('')}}catch(e){if(current===generation.current)setError((e as Error).message)}},[projectId,call])

 useEffect(()=>{generation.current++;setCases([]);setActive('');setMessage(drafts.current[projectId+':']||'');request.current=undefined;void refresh();return()=>{generation.current++}},[refresh])
 useEffect(()=>{if(!visible)return;void refresh();const timer=window.setInterval(()=>{if(!document.hidden)void refresh()},15000);return()=>window.clearInterval(timer)},[refresh,visible])

 const active=cases.find(c=>c.id===activeId)

 async function send(){if(lock.current||!message.trim())return;lock.current=true;setBusy(true);setError('');const current=generation.current;const text=message.trim();if(!request.current||request.current.text!==text||request.current.caseId!==activeId||request.current.projectId!==projectId)request.current={id:crypto.randomUUID(),text,caseId:activeId,projectId};try{const d=await call('/api/developer-support',{action:'message',projectId,message:text,caseId:activeId||undefined,newConversation:!activeId,requestId:request.current.id});if(current===generation.current){setCases(rows=>[d.case,...rows.filter(c=>c.id!==d.case.id)]);setActive(d.case.id);setMessage('');delete drafts.current[projectId+':'+activeId];request.current=undefined}}catch(e){if(current===generation.current)setError((e as Error).message)}finally{lock.current=false;setBusy(false)}}

 const selectConversation=(id:string)=>{drafts.current[projectId+':'+activeId]=message;setActive(id);setMessage(drafts.current[projectId+':'+id]||'');request.current=undefined}
 return <><header className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10"><div><h2 id="developer-support-title" className="text-sm font-semibold">{active?.humanSupport?'Business Support':'Hash support'}</h2><p className="mt-1 text-[11px] text-gray-500">{active?.humanSupport?'Our team will reply here.':'Ask Hash, or talk to our team.'}</p></div><div className="flex items-center gap-1"><button type="button" disabled={busy} aria-label="New conversation" title="New conversation" onClick={()=>selectConversation('')} className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><PlusIcon className="h-4 w-4"/></button><button type="button" onClick={onClose} aria-label="Minimize support chat" className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 dark:hover:bg-white/10"><XMarkIcon className="h-4 w-4"/></button></div></header>
 {error&&<p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
 {!ready||loading?<div role="status" aria-label="Loading support" className="m-4 flex-1 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>:<>
 {(projects.length>0||cases.length>0)&&<div className="flex items-center gap-2 border-b border-gray-100 px-4 py-2 dark:border-white/10">{projects.length>0&&<select aria-label="Support app" disabled={busy} value={projectId} onChange={e=>{drafts.current[projectId+':'+activeId]=message;setProject(e.target.value)}} className="min-h-9 min-w-0 flex-1 rounded-lg bg-transparent px-1 text-xs text-gray-500"><option value="">Your account</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>}{cases.length>0&&<select aria-label="Previous conversations" disabled={busy} value={activeId} onChange={e=>selectConversation(e.target.value)} className="min-h-9 max-w-[45%] rounded-lg bg-transparent px-1 text-xs text-gray-500"><option value="">New conversation</option>{cases.map(c=><option key={c.id} value={c.id}>{c.summary}</option>)}</select>}</div>}
 <div className="min-h-0 flex-1 overflow-y-auto">{active?<Conversation compact messages={active.messages} conversationId={active.id} outgoing="user" customerName="You" staffName="Business Support"/>:<div className="p-5"><div className="mb-5 flex h-10 w-10 items-center justify-center rounded-xl bg-gray-100 dark:bg-white/10"><ChatBubbleLeftRightIcon className="h-5 w-5"/></div><h3 className="text-lg font-semibold">How can we help?</h3><p className="mt-2 text-sm leading-6 text-gray-500">Ask about your integration or a payment. Hash provides automated guidance; our team can take over.</p><div className="mt-5 flex flex-col items-start gap-2">{['Getting started','Webhook confirmation','Talk to a person'].map(t=><button type="button" key={t} disabled={busy} onClick={()=>setMessage(t)} className="min-h-9 rounded-full border border-gray-200 px-3 text-xs hover:bg-gray-50 dark:border-white/15 dark:hover:bg-white/5">{t}</button>)}</div></div>}</div>
 <PocketStyleSupportComposer value={message} onChange={setMessage} onSend={()=>void send()} busy={busy} disabled={active?.status==='resolved'}/>
 </>}
 </>
}
export default function DeveloperSupportWidget(){
 const {ready,authenticated,user}=usePrivy(),location=useLocation(),[open,setOpen]=useState(false),[opened,setOpened]=useState(false),panel=useRef<HTMLDivElement>(null),launcher=useRef<HTMLButtonElement>(null)
 useEffect(()=>{setOpen(false);setOpened(false)},[user?.id])
 useEffect(()=>{if(new URLSearchParams(location.search).get('support')==='open'){setOpened(true);setOpen(true)}},[location.search])
 useEffect(()=>{if(open)panel.current?.focus()},[open])
 if(!ready||!authenticated)return null
 function close(){setOpen(false);launcher.current?.focus()}
 return <div className="fixed bottom-5 right-4 z-50 sm:bottom-6 sm:right-6">{opened&&<div ref={panel} hidden={!open} role="dialog" aria-modal="false" aria-labelledby="developer-support-title" tabIndex={-1} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();close()}}} className={'absolute bottom-16 right-0 h-[min(600px,calc(100dvh-112px))] w-[min(384px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-gray-200 bg-white text-gray-950 shadow-2xl outline-none dark:border-white/10 dark:bg-[#111216] dark:text-gray-100 '+(open?'flex flex-col':'hidden')}><DeveloperSupportChat visible={open} onClose={close}/></div>}<button ref={launcher} type="button" aria-label={open?'Minimize support chat':'Open support chat'} aria-expanded={open} onClick={()=>{if(open)close();else{setOpened(true);setOpen(true)}}} className="ml-auto flex h-12 items-center gap-2 rounded-full bg-gray-950 px-4 text-sm font-medium text-white shadow-lg transition hover:bg-gray-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gray-500 dark:bg-white dark:text-gray-950 dark:hover:bg-gray-100"><ChatBubbleLeftRightIcon className="h-5 w-5"/><span>Support</span></button></div>
}
