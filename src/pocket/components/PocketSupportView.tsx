import './pocketSupportChat.css'
import DynamicSendButton from '../../components/DynamicSendButton'
import { POCKET_NATIVE_BACK_EVENT } from '../lib/pocketNativeBack'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Bot, ArrowLeft, ChevronDown, ChevronRight, MessageCircle, Search, Send, X, Deposit, ArrowLeftRight, Receipt, TrendingUp, UserRound } from './PocketIcons'
import { pocketSupportFaqs, pocketSupportTopics } from '../lib/pocketSupportContent'

type Message = { receipt?:{eventId:string}; id:string; author:'user'|'agent'|'staff'; displayName?:string; avatarDataUrl?:string; kind?:string; text:string; createdAt:number }
type SupportCase = {id:string; summary:string; status:'open'|'assigned'|'waiting_user'|'resolved'; humanSupport?:boolean; messages:Message[]; updatedAt:number; unreadCount?:number; resolutionRequestedAt?:number; resolutionPromptId?:string; priority?:string; category?:string}
type SupportProfile = {displayName:string;avatarDataUrl?:string}
type Result = {cases?:SupportCase[]; case?:SupportCase; team?:SupportProfile[]}
type Props = {call:(body:Record<string,unknown>)=>Promise<Result>; onClose:()=>void; onOpenReceipt?:(eventId:string)=>void; initialCaseId?:string}
const topicIcons = {Deposit, Transfer:ArrowLeftRight, Bills:Receipt, XStocks:TrendingUp, Account:UserRound, 'Talk to support':MessageCircle}
const humanTopics = ['Deposits', 'Bank transfers', 'USDC transfers', 'Bills', 'XStocks', 'XPay', 'Gifts & requests', 'Account & verification']
const label = (item:SupportCase) => item.status === 'resolved' ? 'Closed' : item.status === 'waiting_user' ? 'Awaiting your reply' : item.humanSupport ? 'With support' : 'Open'

function SupportSenderIcon({message}:{message:Message}) {
  const [failed,setFailed]=useState(false)
  if(message.author==='agent')return <Bot aria-hidden="true" className="h-4 w-4 shrink-0"/>
  if(!failed&&message.avatarDataUrl&&/^data:image\/(jpeg|png|webp);base64,/.test(message.avatarDataUrl))return <img src={message.avatarDataUrl} alt="" onError={()=>setFailed(true)} className="h-5 w-5 shrink-0 rounded-full object-cover"/>
  return <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/10 text-[9px] dark:bg-white/10">{(message.displayName||'Pocket Support').split(' ').map(word=>word[0]).slice(0,2).join('').toUpperCase()}</span>
}
export default function PocketSupportView({call,onClose,onOpenReceipt,initialCaseId=''}:Props) {
  const [view,setView] = useState<'home'|'faqs'|'messages'|'previous'|'chat'>(initialCaseId ? 'chat' : 'home')
  useLayoutEffect(()=>{
    const root=document.documentElement
    const previous=root.dataset.pocketSupportSurface
    root.dataset.pocketSupportSurface=view==='home'?'home':view==='chat'?'chat':'neutral'
    return()=>{if(previous)root.dataset.pocketSupportSurface=previous;else delete root.dataset.pocketSupportSurface}
  },[view])
  const [cases,setCases] = useState<SupportCase[]>([])
  const [team,setTeam] = useState<SupportProfile[]>([])
  const [activeId,setActiveId] = useState(initialCaseId)
  const [loaded,setLoaded] = useState(false)
  const [error,setError] = useState('')
  const [sending,setSending] = useState(false)
  const [draft,setDraft] = useState('')
  const [search,setSearch] = useState('')
  const [expanded,setExpanded] = useState('')
  const [routing,setRouting] = useState(false)
  const [retry,setRetry] = useState(0)
  const inFlight = useRef(false)
  const request = useRef<{text:string;id:string}|null>(null)
  const end = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const chatScroll = useRef<HTMLElement>(null)
  const nearBottom = useRef(true)
  const active = cases.find(item=>item.id===activeId)
  const representative = active?.messages.slice().reverse().find(message=>message.author==='staff')
  const waitingForSupport = active?.humanSupport && active.status==='open' && !active.messages.some(message=>message.author==='staff'||message.kind==='staff_joined')
  const visibleCases = cases.filter(item=>view==='previous'?item.status==='resolved':item.status!=='resolved')
  const protectedCase = active?.priority==='high' || active?.category==='bank_payment' || active?.category==='stuck_transaction'
  const loading = !loaded
  const upsert = (item:SupportCase) => setCases(current=>[item,...current.filter(row=>row.id!==item.id)].sort((a,b)=>b.updatedAt-a.updatedAt))
  useEffect(()=>{
    let disposed=false, running=false
    async function load(quiet=false){
      if(running || quiet && document.visibilityState!=='visible') return
      running=true
      try {const data=await call({action:'list-mine'});if(!disposed){setTeam(data.team||[]);setCases(current=>{
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
  useEffect(()=>{if(nearBottom.current)end.current?.scrollIntoView({behavior:'auto',block:'end'})},[active?.messages.length,sending,view,routing])
  useLayoutEffect(()=>{const input=composer.current;if(input){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,116)+'px'}},[draft,view])
  const goBack = () => {
    if(routing){setRouting(false);return}
    if(view==='home'){onClose();return}
    setView(view==='chat'?(active?.status==='resolved'?'previous':'messages'):view==='previous'?'messages':'home');setError('')
  }
  useEffect(()=>{
    const back=(event:Event)=>{if(event.defaultPrevented||document.querySelector('[role="dialog"], [aria-modal="true"]'))return;event.preventDefault();goBack()}
    window.addEventListener(POCKET_NATIVE_BACK_EVENT,back)
    return()=>window.removeEventListener(POCKET_NATIVE_BACK_EVENT,back)
  },[view,routing,active?.status,onClose])
  useEffect(()=>{if(view==='chat' && active?.unreadCount)void call({action:'mark-read',caseId:active.id}).then(data=>{if(data.case)upsert(data.case)}).catch(()=>{})},[view,active?.id,active?.unreadCount,call])
  function openChat(id?:string){if(inFlight.current)return;request.current=null;setDraft('');setRouting(false);nearBottom.current=true;setActiveId(id||'');setError('');setView('chat')}
  async function send(text=draft){
    text=text.trim()
    if(!text || inFlight.current || active?.status==='resolved' || !loaded || Boolean(activeId&&!active)) return
    if(text.length>1500){setError('Keep your message under 1,500 characters.');return}
    inFlight.current=true;setSending(true);setError('')
    if(request.current?.text!==text)request.current={text,id:crypto.randomUUID()}
    try{const data=await call({action:'chat',caseId:activeId||undefined,newConversation:!activeId,message:text,requestId:request.current.id});if(!data.case)throw new Error('Message could not be saved. Please try again.');upsert(data.case);setActiveId(data.case.id);setDraft(current=>current.trim()===text?'':current);setRouting(false);request.current=null}
    catch(reason){setError(reason instanceof Error?reason.message:'Message could not be sent. Please try again.')}
    finally{inFlight.current=false;setSending(false)}
  }
  async function answerResolution(answer:'yes'|'no') {
    if(!active?.resolutionPromptId || inFlight.current)return
    inFlight.current=true;setSending(true);setError('')
    try {const data=await call({action:'resolution-answer',caseId:active.id,promptId:active.resolutionPromptId,answer});if(data.case)upsert(data.case)}
    catch(reason){setError(reason instanceof Error?reason.message:'Could not save your answer.');setRetry(n=>n+1)}
    finally{inFlight.current=false;setSending(false)}
  }
  const rowClass='flex min-h-16 w-full items-center justify-between gap-3 px-5 py-4 text-left text-sm font-medium'
  const panelClass='overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-white/10 dark:bg-[#171717]'
  return <div data-pocket-support-view={view} className={'pocket-support fixed inset-0 z-[55] text-gray-950 dark:text-white '+(view==='chat'?'bg-[#f5f5f5] dark:bg-[#171719]':'bg-white dark:bg-[#101113]')}>
    <div aria-hidden="true" className={view==='home'?'pointer-events-none absolute inset-x-0 top-0 bg-[#086bb1]':'hidden'} style={{height:'var(--pocket-safe-top)'}}/>
    <main className="mx-auto flex h-[100dvh] min-h-0 w-full max-w-[480px] flex-col overflow-hidden" style={{paddingTop:'var(--pocket-safe-top)',paddingBottom:'var(--pocket-safe-bottom)'}}>
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
          <button aria-label="Back" onClick={goBack} className="flex h-11 w-11 items-center justify-center"><ArrowLeft className="h-5 w-5"/></button>
          <div className={view==='chat'?'flex min-w-0 flex-1 items-center gap-2.5 pl-1':'text-center'}>{view==='chat'&&(representative?<SupportSenderIcon message={representative}/>:<Bot className="h-6 w-6 shrink-0" aria-hidden="true"/>)}<div><h1 className="text-base font-semibold">{view==='chat'?(representative?.displayName||'Pocket Support'):view==='faqs'?'Support':view==='previous'?'Previous conversations':'Messages'}</h1>{view==='chat'&&<p className="text-[11px] text-gray-500 dark:text-gray-400">{active?.status==='resolved'?'Conversation closed':representative?'Pocket Support':active?.humanSupport?'The team will reply here':'The team can also help'}</p>}</div></div>
          <button aria-label="Close support" onClick={onClose} className="flex h-11 w-11 items-center justify-center"><X className="h-5 w-5"/></button>
        </header>
        {view==='faqs' && <section className="flex-1 overflow-y-auto px-5 py-5"><h2 className="mb-5 text-xl font-semibold tracking-tight">Frequently asked questions</h2><label className="mb-5 flex items-center gap-3 rounded-xl bg-gray-50 px-4 dark:bg-white/5"><Search className="h-4 w-4 shrink-0 text-gray-400"/><input aria-label="Search FAQs" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search for help" className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none"/></label><div className={panelClass}>{pocketSupportFaqs.filter(faq=>(faq.question+' '+faq.answer).toLowerCase().includes(search.toLowerCase())).map(faq=><div key={faq.question} className="mx-4 border-b border-gray-100 last:border-0 dark:border-white/10"><button className="flex min-h-16 w-full items-center justify-between gap-4 py-4 text-left text-sm" aria-expanded={expanded===faq.question} onClick={()=>setExpanded(expanded===faq.question?'':faq.question)}>{faq.question}<ChevronDown className={'h-4 w-4 shrink-0 '+(expanded===faq.question?'rotate-180':'')}/></button>{expanded===faq.question&&<p className="pb-5 text-sm leading-6 text-gray-500 dark:text-gray-400">{faq.answer}</p>}</div>)}</div>{!pocketSupportFaqs.some(faq=>(faq.question+' '+faq.answer).toLowerCase().includes(search.toLowerCase()))&&<p className="py-6 text-center text-sm text-gray-500">No matching questions. Send us a message.</p>}</section>}
        {(view==='messages'||view==='previous') && <section className="flex-1 overflow-y-auto px-5 py-4">{loading&&!error?<div aria-label="Loading conversations" className="space-y-3">{[1,2,3].map(n=><div key={n} className="h-20 animate-pulse rounded-xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>)}</div>:<>{!visibleCases.length&&<p className="py-12 text-center text-sm text-gray-500">{view==='previous'?'No previous conversations.':'No active conversations.'}</p>}{visibleCases.map(item=><button key={item.id} onClick={()=>openChat(item.id)} className="flex w-full items-center gap-3 border-b border-gray-100 py-5 text-left dark:border-white/10"><MessageCircle className="h-5 w-5 shrink-0 text-gray-400"/><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{item.summary}</span><span className="mt-1 block truncate text-xs text-gray-500">{item.messages[item.messages.length-1]?.text}</span><span className="mt-2 block text-[11px] text-gray-400">{label(item)} · {new Date(item.updatedAt).toLocaleDateString()}</span></span>{!!item.unreadCount&&<span className="h-2 w-2 rounded-full bg-blue-600"/>}<ChevronRight className="h-4 w-4 shrink-0 text-gray-400"/></button>)}</>}<button disabled={loading} onClick={()=>openChat()} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-gray-950">Send us a message</button>{view==='messages'&&cases.some(item=>item.status==='resolved')&&<button onClick={()=>setView('previous')} className="mt-4 w-full py-2 text-xs text-gray-500">Previous conversations</button>}</section>}
        {view==='chat'&&<>
          <section ref={chatScroll} onScroll={event=>{const node=event.currentTarget;nearBottom.current=node.scrollHeight-node.scrollTop-node.clientHeight<90}} className="pocket-support-thread min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-label="Support conversation" aria-live="polite"><p className="pocket-support-intro">Ask a question or share your feedback.</p>
            {loading&&!error?<div aria-label="Loading messages" className="h-24 w-4/5 animate-pulse rounded-2xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5"/>:activeId&&!active?<p className="text-sm text-gray-500">This conversation could not be loaded. Return to Messages and try again.</p>:<>
              {!active?.messages.length&&<div className="pocket-chat-bubble pocket-chat-reply"><p className="pocket-chat-sender"><Bot aria-hidden="true" className="h-4 w-4"/>Hash · AI Agent</p><p className="pocket-chat-text">How may we help you today?</p></div>}
              {active?.messages.map(message=>['handoff','staff_joined','automatic_reminder','automatic_resolution','case_reopened','resolution_prompt'].includes(message.kind || '') ? <div key={message.id} className="my-5 text-center text-xs leading-5 text-gray-500 dark:text-gray-400"><p>{message.text}</p>{message.kind==='resolution_prompt' && active.resolutionPromptId===message.id && active.status!=='resolved' && <><p className="mt-1 text-[11px]">{protectedCase?'This payment case stays open until it is reviewed.':'This conversation closes after 24 hours without a reply.'}</p><div className="mt-3 flex flex-wrap justify-center gap-2"><button disabled={sending} onClick={()=>void answerResolution('yes')} className="rounded-full border border-gray-200 px-4 py-2 text-xs dark:border-white/15">Yes, I need help</button><button disabled={sending} onClick={()=>void answerResolution('no')} className="rounded-full border border-gray-200 px-4 py-2 text-xs dark:border-white/15">No, all sorted</button></div></>}</div> : <div key={message.id} className={'pocket-chat-bubble '+(message.author==='user'?'pocket-chat-outgoing':'pocket-chat-reply')}>{message.author!=='user'&&<p className="pocket-chat-sender"><SupportSenderIcon message={message}/>{message.author==='staff'?(message.displayName&&message.displayName!=='Pocket Support'?message.displayName+' · Pocket Support':'Pocket Support'):'Hash · AI Agent'}</p>}<p className="pocket-chat-text">{message.text}</p>{message.author==='agent'&&message.receipt?.eventId&&onOpenReceipt&&<button type="button" className="mt-2 min-h-10 text-xs font-semibold underline underline-offset-4" onClick={()=>onOpenReceipt(message.receipt!.eventId)}>View receipt</button>}<p className="pocket-chat-time">{new Date(message.createdAt).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</p></div>)}
              {active?.humanSupport&&!active.messages.some(m=>m.kind==='handoff'||m.kind==='staff_joined'||m.author==='staff')&&active.status!=='resolved'&&<p className="my-5 text-center text-xs text-gray-500">You are in the queue for Pocket Support.</p>}
              {routing&&!active?.humanSupport&&<><div className="pocket-chat-bubble pocket-chat-outgoing"><p className="pocket-chat-text">Talk to support</p></div><div className="pocket-chat-bubble pocket-chat-reply"><p className="pocket-chat-sender"><Bot aria-hidden="true" className="h-4 w-4"/>Hash · AI Agent</p><p className="pocket-chat-text">What do you need help with? Choose a topic below. The team will see this conversation.</p></div></>}
              {sending&&!active?.humanSupport&&<div role="status" aria-label="Hash is preparing a reply" className="pocket-support-thinking"><div className="inline-flex items-center rounded-[18px] rounded-bl-md bg-[#f0f0f0] px-3.5 py-2.5 shadow-sm dark:bg-white/[0.08]"><span className="inline-flex items-center gap-1" aria-hidden="true">{[0,1,2].map(index=><span key={index} className="h-2 w-2 animate-bounce motion-reduce:animate-none rounded-full bg-[#8e8e93] dark:bg-gray-300" style={{animationDelay:index*120+'ms'}}/>)}</span></div><p className="ml-3 mt-1 text-xs italic text-[#8e8e93] dark:text-gray-400">Preparing a reply...</p></div>}
            </>}<div ref={end}/>
          </section>
          {loaded&&!active?.humanSupport&&active?.status!=='resolved'&&(!activeId||routing)&&<div className="pocket-support-topics" aria-label={routing?'Choose a support topic':'Support topics'}>
            {routing?<>{humanTopics.map(topic=><button key={topic} disabled={sending} onClick={()=>void send('Talk to support about '+topic.toLowerCase())} className="pocket-support-topic">{topic}</button>)}<button disabled={sending} onClick={()=>setRouting(false)} className="pocket-support-topic">Go back</button></>:pocketSupportTopics.map(topic=>{const Icon=topicIcons[topic];return <button key={topic} disabled={sending} onClick={()=>topic==='Talk to support'?setRouting(true):void send(topic)} className="pocket-support-topic"><Icon className="h-4 w-4" aria-hidden="true"/>{topic}</button>})}
          </div>}
          {loaded&&activeId&&active&&!active.humanSupport&&active.status!=='resolved'&&!routing&&<div className="pocket-support-topics"><button disabled={sending} onClick={()=>setRouting(true)} className="pocket-support-topic"><MessageCircle className="h-4 w-4" aria-hidden="true"/>Talk to support</button></div>}
          {waitingForSupport&&<div className="pocket-support-waiting" role="status"><span className="pocket-support-team" aria-hidden="true">{team.length?team.slice(0,3).map((profile,index)=><span key={index} className="pocket-support-team-avatar"><SupportSenderIcon message={{id:'team-'+index,author:'staff',text:'',createdAt:0,...profile}}/></span>):<span className="pocket-support-team-avatar"><UserRound className="h-4 w-4"/></span>}</span><span>Waiting for Pocket Support</span></div>}
          {active?.status==='resolved'?<button onClick={()=>{setActiveId('');setDraft('');setError('');setRouting(false);nearBottom.current=true}} className="mx-5 mb-4 min-h-12 rounded-full bg-gray-950 text-sm text-white dark:bg-white dark:text-gray-950">Start a new conversation</button>:<form onSubmit={event=>{event.preventDefault();void send()}} className="pocket-support-composer">
            <div className="pocket-support-input-wrap"><textarea rows={1} ref={composer} data-agent-hash-input="true" aria-label="Message" value={draft} maxLength={1500} onChange={event=>setDraft(event.target.value)} onFocus={()=>{nearBottom.current=true;window.requestAnimationFrame(()=>end.current?.scrollIntoView({behavior:'auto',block:'end'}))}} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send()}}} placeholder="Message..." disabled={!loaded||Boolean(activeId&&!active)} className="pocket-support-input"/><DynamicSendButton inputText={draft} isLoading={sending} canStop={false} onSend={()=>void send()} onStop={()=>{}} idleLabel="Write a message" onAddAttachment={()=>composer.current?.focus()} disabled={!loaded||Boolean(activeId&&!active)} className="absolute bottom-1 right-1"/></div>
          </form>}

        </>}
      </>}
      {error&&<div role="alert" className="shrink-0 px-5 py-3 text-xs text-red-600 dark:text-red-300">{error}{!loaded&&<button onClick={()=>setRetry(n=>n+1)} className="ml-2 underline">Try again</button>}</div>}
    </main>
  </div>
}
