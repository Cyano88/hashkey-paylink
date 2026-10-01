import {useEffect,useState,useCallback} from 'react'
import type {HashKnowledge} from '../../api/hash-support/knowledge'
type Props={call:(body:Record<string,unknown>)=>Promise<{knowledge?:HashKnowledge[]}>;sourceCase?:{id:string;status:string}}
export default function HashSupportKnowledgePanel({call,sourceCase}:Props){
 const [entries,setEntries]=useState<HashKnowledge[]>([]),[question,setQuestion]=useState(''),[answer,setAnswer]=useState('')
 const [busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const [reviewed,setReviewed]=useState<Record<string,boolean>>({})
 const load=useCallback(async()=>{const data=await call({action:'staff-knowledge-list'});setEntries((data.knowledge||[]).sort((a,b)=>b.updatedAt-a.updatedAt));setLoaded(true)},[call])
 useEffect(()=>{void load().catch(()=>setError('Knowledge could not load. Try again.'))},[load])
 useEffect(()=>{setQuestion('');setAnswer('');setNotice('')},[sourceCase?.id])
 async function operate(body:Record<string,unknown>){
  if(busy)return;setBusy(true);setError('');setNotice('')
  try{await call(body);await load();setReviewed({});if(body.action==='staff-knowledge-draft'){setQuestion('');setAnswer('');setNotice('Draft saved. Review it before publishing.')}else setNotice(body.action==='staff-knowledge-approve'?'Answer published.':'Answer withdrawn.')}
  catch(reason){setError(reason instanceof Error?reason.message:'Knowledge could not be saved.')}
  finally{setBusy(false)}
 }
 const field='w-full rounded-xl border border-gray-200 bg-transparent px-3 py-2 text-sm dark:border-white/15'
 return <details className="mb-5 rounded-2xl border border-gray-200 p-4 dark:border-white/15">
  <summary className="cursor-pointer text-sm font-semibold">Hash knowledge</summary>
  <p className="mt-3 text-xs leading-5 text-gray-500">Reviewed answers for common questions. Drafts stay private. Published answers need review after 90 days.</p>
  {error&&<p role="alert" className="mt-3 text-xs text-red-600">{error}<button type="button" onClick={()=>{setError('');void load().catch(()=>setError('Knowledge could not load. Try again.'))}} className="ml-2 underline">Refresh</button></p>}
  {notice&&<p role="status" className="mt-3 text-xs">{notice}</p>}
  {sourceCase?.status==='resolved'?<form className="mt-4 space-y-3" onSubmit={event=>{event.preventDefault();void operate({action:'staff-knowledge-draft',caseId:sourceCase.id,question,answer})}}>
   <label className="block text-xs">General question<input aria-label="General question" value={question} maxLength={180} onChange={event=>setQuestion(event.target.value)} disabled={busy} className={'mt-1 '+field}/></label>
   <label className="block text-xs">Reusable answer<textarea aria-label="Reusable answer" value={answer} maxLength={1500} rows={3} onChange={event=>setAnswer(event.target.value)} disabled={busy} className={'mt-1 '+field}/></label>
   <p className="text-xs text-gray-500">Write general instructions only. Remove names, contact details, account numbers and transaction details. Do not copy the conversation.</p>
   <button disabled={busy||!question.trim()||!answer.trim()} className="rounded-full border px-4 py-2 text-xs disabled:opacity-40">Save draft</button>
  </form>:<p className="mt-3 text-xs text-gray-500">Select a resolved case to draft a reusable answer.</p>}
  {!loaded&&!error&&<div aria-label="Loading knowledge" className="mt-4 h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>}
  {loaded&&!entries.length&&<p className="mt-4 text-xs text-gray-500">No saved answers yet.</p>}
  <div className="mt-4 space-y-3">{entries.map(item=><article key={item.id} className="rounded-xl border border-gray-100 p-3 dark:border-white/10">
   <p className="text-xs text-gray-500">{item.status==='approved'&&(item.expiresAt||0)<=Date.now()?'Review expired':item.status==='approved'?'Published':item.status==='draft'?'Draft':'Withdrawn'}</p>
   <p className="mt-2 text-sm font-semibold">{item.question}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{item.answer}</p>
   {item.status==='draft'&&<label className="mt-3 flex items-start gap-2 text-xs leading-5"><input type="checkbox" checked={!!reviewed[item.id]} onChange={event=>setReviewed(current=>({...current,[item.id]:event.target.checked}))}/>I reviewed this answer. It is accurate, general and contains no customer details.</label>}
   <div className="mt-3 flex gap-2">{item.status==='draft'&&<button disabled={busy||!reviewed[item.id]} onClick={()=>void operate({action:'staff-knowledge-approve',id:item.id,version:item.version,reviewConfirmed:true})} className="rounded-full border px-3 py-2 text-xs disabled:opacity-40">Publish answer</button>}{item.status!=='retired'&&<button disabled={busy} onClick={()=>void operate({action:'staff-knowledge-retire',id:item.id,version:item.version})} className="rounded-full border px-3 py-2 text-xs disabled:opacity-40">{item.status==='draft'?'Discard draft':'Withdraw answer'}</button>}</div>
  </article>)}</div>
 </details>
}
