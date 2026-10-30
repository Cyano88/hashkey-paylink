import {useEffect,useRef,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {SANDBOX_ASSETS,SANDBOX_ENDPOINT,type SandboxSnapshot} from '../lib/developerSandbox'
import {copyToClipboard} from '../lib/utils'
const field='mt-2 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 text-sm dark:border-white/10'
export default function SandboxPanel({profileId='personal'}:{profileId?:string}){
 const {getAccessToken}=usePrivy()
 const [snapshot,setSnapshot]=useState<SandboxSnapshot>({keys:[],payments:[]})
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const [secret,setSecret]=useState(''),[fixture,setFixture]=useState(''),[copied,setCopied]=useState(false)
 const [form,setForm]=useState({title:'My first test payment',amount:'1.50',network:'base',asset:'USDC'})
 const lock=useRef(false),mounted=useRef(true),attempt=useRef({id:crypto.randomUUID(),reference:'order-'+crypto.randomUUID()})
 async function request(body?:Record<string,unknown>){
  const token=await getAccessToken();if(!token)throw Error('Sign in again to continue.')
  const response=await fetch(SANDBOX_ENDPOINT+'&profileId='+encodeURIComponent(profileId),{method:body?'POST':'GET',cache:'no-store',signal:AbortSignal.timeout(20000),headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json','idempotency-key':attempt.current.id}:{})},...(body?{body:JSON.stringify(body)}:{})})
  const data=await response.json();if(!response.ok||!data.ok)throw Error(data.error||'Sandbox request failed.');return data
 }
 async function refresh(){const data=await request();if(!Array.isArray(data.payments)||!Array.isArray(data.keys)||data.payments.some((p:any)=>p.environment!=='test'||p.simulated!==true))throw Error('Sandbox returned an invalid response. Reload to try again.');if(mounted.current)setSnapshot(data)}
 useEffect(()=>{mounted.current=true;refresh().catch(e=>{if(mounted.current)setError(e.message)}).finally(()=>{if(mounted.current)setLoading(false)});return()=>{mounted.current=false}},[]) // eslint-disable-line react-hooks/exhaustive-deps
 async function run(body:Record<string,unknown>){
  if(lock.current)return;lock.current=true;setBusy(true);setError('');setCopied(false)
  try{const data=await request(body);if(!mounted.current)return
   if(data.apiKey)setSecret(data.apiKey)
   if(data.fixture)setFixture(JSON.stringify(data.fixture,null,2))
   if(body.action==='create-checkout')attempt.current={id:crypto.randomUUID(),reference:'order-'+crypto.randomUUID()}
   await refresh()
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'Sandbox request failed.')}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 const example=`const response = await fetch('https://app.hashpaylink.com${SANDBOX_ENDPOINT}', {
  method: 'POST',
  headers: {
    'X-API-Key': process.env.HASHPAYLINK_TEST_KEY,
    'Content-Type': 'application/json',
    'Idempotency-Key': 'test-order-1042-attempt-1'
  },
  body: JSON.stringify({action: 'create-checkout', title: 'Test order',
    amount: '1.50', network: 'base', asset: 'USDC', reference: 'order-1042'})
});
const {checkout} = await response.json();
// GET the same endpoint with &id=checkout.id to read its test status.
// POST {action: 'simulate', id: checkout.id, status: 'paid'} to finish it.`
 return <div className="space-y-8">
  <header><p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-300">Sandbox</p><h1 className="mt-2 text-3xl font-semibold">Build your first payment</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-gray-500">Test checkout states and your webhook signature handler without money or verification. Each profile keeps its own test data when you switch to Production.</p></header>
  <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-blue-900 dark:bg-blue-400/10 dark:text-blue-200">Simulated checkout only. No wallet, bank transfer, email receipt or on-chain transaction is created. Funded testnet payments, funding products and provider compliance outcomes are not included.</div>
  {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  {loading?<div role="status" aria-label="Loading sandbox" className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>:<>
   <section><h2 className="text-lg font-semibold">1. Create a test payment</h2>
    <form onSubmit={e=>{e.preventDefault();void run({action:'create-checkout',...form,reference:attempt.current.reference})}}>
     <fieldset disabled={busy} className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="text-sm">Description<input required maxLength={100} className={field} value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
      <label className="text-sm">Amount<input required inputMode="decimal" className={field} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
      <label className="text-sm">Network<select className={field} value={form.network} onChange={e=>setForm({...form,network:e.target.value,asset:SANDBOX_ASSETS[e.target.value][0]})}>{Object.keys(SANDBOX_ASSETS).map(n=><option key={n} value={n}>{n==='bsc'?'BNB Chain':n==='xlayer'?'X Layer':n[0].toUpperCase()+n.slice(1)}</option>)}</select></label>
      <label className="text-sm">Asset<select className={field} value={form.asset} onChange={e=>setForm({...form,asset:e.target.value})}>{SANDBOX_ASSETS[form.network].map(a=><option key={a}>{a}</option>)}</select></label>
     </fieldset><button disabled={busy} className="developer-primary mt-5">Create test payment</button>
    </form>
    <div className="mt-5 space-y-3">{snapshot.payments.slice(0,20).map(p=><article key={p.id} className="rounded-xl border border-gray-200 p-4 dark:border-white/10"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{p.title}</h3><span className="text-sm">{p.amount} {p.asset}</span></div><p className="mt-1 text-xs text-gray-500">{p.network} · Test · {p.status}</p><p className="mt-2 break-all font-mono text-xs text-gray-400">{p.id}</p>{['pending','processing'].includes(p.status)?<div className="mt-3 flex flex-wrap gap-3">{(['processing','paid','failed','expired'] as const).filter(s=>s!==p.status).map(s=><button type="button" key={s} disabled={busy} onClick={()=>void run({action:'simulate',id:p.id,status:s})} className="min-h-11 rounded-lg border border-gray-200 px-3 text-xs font-medium dark:border-white/10">Simulate {s}</button>)}</div>:p.status==='paid'&&<button disabled={busy} onClick={()=>void run({action:'webhook-fixture',id:p.id})} className="mt-3 min-h-11 text-sm underline">Get signed webhook fixture</button>}</article>)}{!snapshot.payments.length&&<p className="text-sm text-gray-500">Your test payments will appear here.</p>}</div>
   </section>
   {fixture&&<section><h2 className="font-semibold">Signed fixture</h2><p className="mt-2 text-sm leading-6 text-gray-500">Use this test secret, exact payload and headers with your local webhook handler. The timestamp is fresh; generate another fixture if it expires. Nothing has been sent to your production webhook.</p><pre className="mt-4 max-h-80 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-white">{fixture}</pre><button className="mt-2 min-h-11 text-sm underline" onClick={()=>void copyToClipboard(fixture)}>Copy fixture</button></section>}
   <section className="border-t border-gray-200 pt-7 dark:border-white/10"><h2 className="text-lg font-semibold">2. Connect your backend</h2><p className="mt-2 text-sm text-gray-500">Test keys belong to this profile and work only with the sandbox endpoint below. Keep them on your server.</p><button disabled={busy} onClick={()=>void run({action:'create-key'})} className="developer-primary mt-4">Create sandbox key</button>
    {secret&&<div className="mt-4 rounded-xl border border-gray-200 p-4 dark:border-white/10"><p className="text-sm font-medium">Copy this key now. It will not be shown again.</p><code className="mt-3 block break-all text-xs">{secret}</code><button className="mt-2 min-h-11 text-sm underline" onClick={async()=>{await copyToClipboard(secret);setCopied(true)}}>{copied?'Copied':'Copy key'}</button></div>}
    <div className="mt-4 space-y-2">{snapshot.keys.filter(k=>!k.revokedAt).map(k=><div key={k.id} className="flex items-center justify-between gap-3 text-sm"><code>{k.prefix}…</code><button disabled={busy} onClick={()=>void run({action:'revoke-key',keyId:k.id})} className="min-h-11 text-red-600">Revoke</button></div>)}</div>
    <pre className="mt-5 overflow-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-white">{example}</pre>
   </section>
   <section className="border-t border-gray-200 pt-7 dark:border-white/10"><h2 className="text-lg font-semibold">3. Move to production</h2><p className="mt-2 text-sm leading-6 text-gray-500">Use the Production switch in the menu. Create an app, configure its receiving wallet, then create a production key. Wallet checkout is available before verification; normal fees apply. Local fiat requires personal KYC for individuals or business KYB for companies. Production uses the hosted checkout API and real customer approval.</p><a href="https://docs.hashpaylink.com/docs/getting-started" className="mt-3 inline-flex min-h-11 items-center text-sm underline">Read the production integration guide</a></section>
  </>}
 </div>
}
