import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, ChevronRight, MessageCircle, Search, Send, X } from './PocketIcons'
import { pocketSupportFaqs, pocketSupportTopics } from '../lib/pocketSupportContent'

type Message = { id:string; author:'user'|'agent'|'staff'; displayName?:string; text:string; createdAt:number }
type SupportCase = {id:string; summary:string; status:'open'|'assigned'|'waiting_user'|'resolved'; humanSupport?:boolean; messages:Message[]; updatedAt:number; unreadCount?:number}
type Result = {cases?:SupportCase[]; case?:SupportCase}
type Props = {call:(body:Record<string,unknown>)=>Promise<Result>; onClose:()=>void; initialCaseId?:string}
const label = (item:SupportCase) => item.status === 'resolved' ? 'Closed' : item.status === 'waiting_user' ? 'Awaiting your reply' : item.humanSupport ? 'With support' : 'Open'

export default function PocketSupportView({call,onClose,initialCaseId=''}:Props) {
  const [view,setView] = useState<'home'|'faqs'|'messages'|'chat'>(initialCaseId ? 'chat' : 'home')
  const [cases,setCases] = useState<SupportCase[]>([])
  const [activeId,setActiveId] = useState(initialCaseId)
  const [loaded,setLoaded] = useState(false)
  const [error,setError] = useState('')
  const [sending,setSending] = useState(false)
  const [draft,setDraft] = useState('')
  const [search,setSearch] = useState('')
  const [expanded,setExpanded] = useState('')
  const [retry,setRetry] = useState(0)
  const inFlight = useRef(false)
  const request = useRef<{text:string;id:string}|null>(null)
  const end = useRef<HTMLDivElement>(null)
  const active = cases.find(item=>item.id===activeId)
  const loading = !loaded
  const open = cases.find(item=>item.status!=='resolved')
  const upsert = (item:SupportCase) => setCases(current=>[item,...current.filter(row=>row.id!==item.id)].sort((a,b)=>b.updatedAt-a.updatedAt))
  useEffect(()=>{
    let disposed=false, running=false
    async function load(quiet=false){
      if(running || quiet && document.visibilityState!=='visible') return
      running=true
      try {const data=await call({action:'list-mine'});if(!disposed){setCases(current=>{
        const fresh=data.cases||[]
        return [...fresh.map(item=>{const newer=current.find(old=>old.id===item.id);return newer && newer.updatedAt>item.updatedAt?newer:item}),...current.filter(old=>!fresh.some(item=>item.id===old.id))].sort((a,b)=>b.updatedAt-a.updatedAt)
      });setLoaded(true);if(!quiet)setError('')}}
      catch(reason){if(!disposed && !quiet)setError(reason instanceof Error?reason.message:'Support could not load.')}
      finally{running=false}
    }
    void load()
    const timer=window.setInterval(()=>void load(true),30000)
    return()=>{disposed=true;window.clearInterval(timer)}
  },[call,retry])
  useEffect(()=>{end.current?.scrollIntoView({behavior:'auto'})},[active?.messages.length,sending,view])
  useEffect(()=>{if(view==='chat' && active?.unreadCount)void call({action:'mark-read',caseId:active.id}).then(data=>{if(data.case)upsert(data.case)}).catch(()=>{})},[view,active?.id,active?.unreadCount,call])
  function openChat(id?:string){setActiveId(id||open?.id||'');setError('');setView('chat')}
  async function send(text=draft){
    text=text.trim()
    if(!text || inFlight.current || active?.status==='resolved' || !loaded) return
    if(text.length>1500){setError('Keep your message under 1,500 characters.');return}
    inFlight.current=true;setSending(true);setError('')
    if(request.current?.text!==text)request.current={text,id:crypto.randomUUID()}
    try{const data=await call({action:'chat',caseId:activeId||undefined,message:text,requestId:request.current.id});if(!data.case)throw new Error('Message could not be saved. Please try again.');upsert(data.case);setActiveId(data.case.id);setDraft('');request.current=null}
    catch(reason){setError(reason instanceof Error?reason.message:'Message could not be sent. Please try again.')}
    finally{inFlight.current=false;setSending(false)}
  }
  const rowClass='flex min-h-16 w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium'
  const panelClass='overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#171717]'
  return <div className="fixed inset-0 z-[55] bg-white text-gray-950 dark:bg-[#101113] dark:text-white">
    <main className="mx-auto flex h-[100dvh] w-full max-w-[480px] flex-col overflow-hidden" style={{paddingTop:'var(--pocket-safe-top)',paddingBottom:'var(--pocket-safe-bottom)'}}>
      {view==='home'? <>
        <div className="shrink-0 bg-gradient-to-b from-[#086bb1] via-[#1787bd] to-white px-6 pb-14 pt-6 dark:to-[#101113]">
          <div className="flex items-center justify-between"><div className="flex -space-x-2" aria-hidden="true"><img src="/pocket-support-portrait.jpg" alt="" className="h-11 w-11 rounded-full border-2 border-white/30 object-cover object-[50%_30%]"/><span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white/20 bg-[#6652b2] text-sm text-white">P</span></div><button onClick={onClose} aria-label="Close support" className="flex h-11 w-11 items-center justify-center text-white"><X className="h-6 w-6"/></button></div>
          <h1 className="mt-10 text-[28px] font-semibold leading-tight tracking-tight text-white"><span className="block text-white/65">Hi there</span>How can we help?</h1>
        </div>
        <div className="-mt-4 flex-1 space-y-3 overflow-y-auto px-5 pb-6">
          <div className={panelClass}><button className={rowClass} onClick={()=>setView('faqs')}><span>FAQs</span><ChevronRight className="h-4 w-4"/></button><div className="mx-5 border-t border-gray-100 dark:border-white/10"/><button className={rowClass} onClick={()=>setView('messages')}><span>Messages</span><MessageCircle className="h-4 w-4"/></button></div>
          <button className={panelClass+' '+rowClass} onClick={()=>openChat()}><span>Send us a message</span><Send className="h-5 w-5"/></button>
          <button className={panelClass+' '+rowClass} onClick={()=>setView('faqs')}><span>Search for help</span><Search className="h-5 w-5"/></button>
        </div>
      </> : <>
        <header className="flex min-h-16 shrink-0 items-center justify-between border-b border-gray-100 px-4 dark:border-white/10">
          <button aria-label="Back" onClick={()=>{setView(view==='chat'?'messages':'home');setError('')}} className="flex h-11 w-11 items-center justify-center"><ArrowLeft className="h-5 w-5"/></button>
          <div className="text-center"><h1 className="text-base font-semibold">{view==='chat'?'Pocket Support':view==='faqs'?'Support':'Messages'}</h1>{view==='chat'&&<p className="text-[11px] text-gray-500">{active?.status==='resolved'?'Conversation closed':active?.humanSupport?'The team will reply here':'The team can also help'}</p>}</div>
          <button aria-label="Close support" onClick={onClose} className="flex h-11 w-11 items-center justify-center"><X className="h-5 w-5"/></button>
        </header>
        {view==='faqs' && <section className="flex-1 overflow-y-auto px-5 py-5"><h2 className="mb-5 text-xl font-semibold tracking-tight">Frequently asked questions</h2><label className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 px-4 dark:bg-white/5"><Search className="h-4 w-4 shrink-0 text-gray-400"/><input aria-label="Search FAQs" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search for help" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label><div className={panelClass}>{pocketSupportFaqs.filter(faq=>(faq.question+' '+faq.answer).toLowerCase().includes(search.toLowerCase())).map(faq=><div key={faq.question} className="mx-4 border-b border-gray-100 last:border-0 dark:border-white/10"><button className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left text-sm" aria-expanded={expanded===faq.question} onClick={()=>setExpanded(expanded===faq.question?'':faq.question)}>{faq.question}<ChevronDown className={'h-4 w-4 shrink-0 '+(expanded===faq.question?'rotate-180':'')}/></button>{expanded===faq.question&&<p className="pb-5 text-sm leading-6 text-gray-500 dark:text-gray-400">{faq.answer}</p>}</div>)}</div>{!pocketSupportFaqs.some(faq=>(faq.question+' '+faq.answer).toLowerCase().includes(search.toLowerCase()))&&<p className="py-6 text-center text-sm text-gray-500">No matching questions. Send us a message.</p>}</section>}
        {view==='messages' && <section className="flex-1 overflow-y-auto px-5 py-4">{loading&&!error?<div aria-label="Loading conversations" className="space-y-3">{[1,2,3].map(n=><div key={n} className="h-20 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>)}</div>:<>{!cases.length&&<p className="py-12 text-center text-sm text-gray-500">Your conversations will appear here.</p>}{cases.map(item=><button key={item.id} onClick={()=>openChat(item.id)} className="flex w-full items-center gap-3 border-b border-gray-100 py-5 text-left dark:border-white/10"><MessageCircle className="h-5 w-5 shrink-0 text-gray-400"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.summary}</span><span className="mt-1 block truncate text-xs text-gray-500">{item.messages[item.messages.length-1]?.text}</span><span className="mt-2 block text-[11px] text-gray-400">{label(item)} · {new Date(item.updatedAt).toLocaleDateString()}</span></span>{!!item.unreadCount&&<span className="h-2 w-2 rounded-full bg-blue-600"/>}<ChevronRight className="h-4 w-4 shrink-0 text-gray-400"/></button>)}</>}<button disabled={loading} onClick={()=>openChat()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Send us a message</button></section>}
        {view==='chat'&&<>
          <section className="flex-1 overflow-y-auto px-5 py-5" aria-label="Support conversation" aria-live="polite">
            {loading&&!error?<div aria-label="Loading messages" className="h-24 w-4/5 animate-pulse rounded-2xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>:activeId&&!active?<p className="text-sm text-gray-500">This conversation could not be loaded. Return to Messages and try again.</p>:<>
              {!active?.messages.length&&<div className="max-w-[88%] rounded-2xl bg-gray-100 p-4 dark:bg-white/[0.07]"><p className="mb-2 text-xs font-semibold">Hash · AI Agent</p><p className="text-sm">How may we help you today?</p></div>}
              {active?.messages.map(message=><div key={message.id} className={'mb-4 w-fit max-w-[88%] break-words rounded-2xl px-4 py-3 '+(message.author==='user'?'ml-auto bg-gray-950 text-white dark:bg-white dark:text-gray-950':'bg-gray-100 dark:bg-white/[0.07]')}>{message.author!=='user'&&<p className="mb-1.5 text-xs font-semibold">{message.author==='staff'?(message.displayName&&message.displayName!=='Pocket Support'?message.displayName+' · Pocket Support':'Pocket Support'):'Hash · AI Agent'}</p>}<p className="whitespace-pre-wrap text-sm leading-6">{message.text}</p><p className="mt-1 text-[10px] opacity-45">{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p></div>)}
              {sending&&<p role="status" className="text-xs text-gray-500">Sending...</p>}
            </>}<div ref={end}/>
          </section>
          {loaded&&!activeId&&!error&&<div className="flex flex-wrap justify-center gap-2 px-5 pb-4">{pocketSupportTopics.map(topic=><button key={topic} disabled={sending} onClick={()=>void send(topic)} className="rounded-full border border-gray-200 px-3 py-2 text-xs disabled:opacity-40 dark:border-white/10">{topic}</button>)}</div>}
          {active?.status==='resolved'?<button onClick={()=>{setActiveId('');setDraft('');setError('')}} className="mx-5 mb-4 min-h-12 rounded-full bg-gray-950 text-sm text-white dark:bg-white dark:text-gray-950">New message</button>:<form onSubmit={event=>{event.preventDefault();void send()}} className="flex items-end gap-2 border-t border-gray-100 px-4 py-3 dark:border-white/10"><textarea aria-label="Message" value={draft} maxLength={1500} rows={2} onChange={event=>setDraft(event.target.value)} placeholder="Your message..." className="max-h-28 min-w-0 flex-1 resize-none rounded-2xl bg-gray-50 px-4 py-3 text-sm outline-none dark:bg-white/5"/><button aria-label="Send message" disabled={sending||!draft.trim()||!loaded||Boolean(activeId&&!active)} type="submit" className="mb-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-950 text-white disabled:opacity-30 dark:bg-white dark:text-gray-950"><Send className="h-5 w-5"/></button></form>}
        </>}
      </>}
      {error&&<div role="alert" className="shrink-0 px-5 py-3 text-xs text-red-600 dark:text-red-300">{error}{!loaded&&<button onClick={()=>setRetry(n=>n+1)} className="ml-2 underline">Try again</button>}</div>}
    </main>
  </div>
}
