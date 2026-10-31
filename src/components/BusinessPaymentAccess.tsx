import {useState} from 'react'
export type PaymentAccess={operationalStatus:'active'|'suspended';suspensionReason?:string;suspendedAt?:string;suspendedBy?:string;operations?:Array<{id:string;action:string;actor:string;createdAt:string;reason?:string}>}
export default function BusinessPaymentAccess({access,busy,onChange}:{access:PaymentAccess;busy:boolean;onChange:(action:'admin-suspend'|'admin-reactivate',reason:string)=>Promise<boolean>}){
 const [editing,setEditing]=useState(false),[confirming,setConfirming]=useState(false),[reason,setReason]=useState('')
 const suspended=access.operationalStatus==='suspended',label=suspended?'Lift suspension':'Suspend payment access'
 async function submit(){if(await onChange(suspended?'admin-reactivate':'admin-suspend',reason.trim())){setEditing(false);setConfirming(false);setReason('')}}
 return <section aria-label="Payment access" className="rounded-xl border border-gray-200 p-5 dark:border-white/10">
  <h3 className="font-semibold">Payment access</h3>
  <p className={'mt-2 text-sm font-medium '+(suspended?'text-red-600 dark:text-red-400':'')}>{suspended?'Suspended':'Not suspended'}</p>
  <p className="mt-2 text-sm text-gray-500">Suspension blocks new checkout creation for this app. It preserves the app, API keys and payment history.</p>
  {suspended&&<div className="mt-3 space-y-1 text-sm"><p>{access.suspensionReason}</p><p className="text-xs text-gray-500">{access.suspendedBy}{access.suspendedAt?' ? '+new Date(access.suspendedAt).toLocaleString():''}</p></div>}
  {!editing?<button type="button" disabled={busy} onClick={()=>setEditing(true)} className="mt-4 min-h-10 rounded-xl border border-red-200 px-4 text-sm font-medium text-red-600 disabled:opacity-40 dark:border-red-400/30 dark:text-red-400">{label}</button>:<form className="mt-4 space-y-3" onSubmit={e=>{e.preventDefault();if(confirming)void submit();else setConfirming(true)}}>
   <fieldset disabled={busy} className="space-y-3">
    <label className="block text-sm">{suspended?'Reason for lifting suspension':'Suspension reason'}<textarea required minLength={8} maxLength={300} readOnly={confirming} value={reason} onChange={e=>setReason(e.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-gray-200 bg-transparent p-3 text-sm dark:border-white/10"/></label>
    {confirming&&<p className="text-sm text-gray-600 dark:text-gray-300">{suspended?'Confirm that the investigation is complete. Lifting suspension does not bypass verification or settlement requirements.':'Confirm suspension of this app. Customers will be unable to start new checkouts. The reason and your staff account will be recorded.'}</p>}
    <div className="flex flex-wrap gap-4"><button type="submit" disabled={busy||reason.trim().length<8} className="min-h-10 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white disabled:opacity-40">{busy?'Saving?':confirming?(suspended?'Confirm lift suspension':'Confirm suspension'):(suspended?'Review lifting suspension':'Review suspension')}</button><button type="button" onClick={()=>{setEditing(false);setConfirming(false);setReason('')}} className="min-h-10 text-sm">Cancel</button></div>
   </fieldset>
  </form>}
  {Boolean(access.operations?.some(o=>o.action==='suspended'||o.action==='reactivated'))&&<details className="mt-4"><summary className="cursor-pointer text-sm">Payment access history</summary><div className="mt-3 space-y-3">{access.operations?.filter(o=>o.action==='suspended'||o.action==='reactivated').map(o=><div key={o.id} className="text-xs text-gray-500"><p>{o.action==='suspended'?'Suspended':'Suspension lifted'} ? {o.actor} ? {new Date(o.createdAt).toLocaleString()}</p>{o.reason&&<p className="mt-1">{o.reason}</p>}</div>)}</div></details>}
 </section>
}
