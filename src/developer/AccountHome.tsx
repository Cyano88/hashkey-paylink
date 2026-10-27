import {useEffect,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {ArrowRight,Check,Plus} from 'lucide-react'
import type {ProjectSummary,PortalSection} from './PortalPanels'
import {readActivityResponse} from './activityResponse'

type App=ProjectSummary & {name:string}
type Payment={recordId:string;amount:string;asset:string;status:string;createdAt:string;projectId:string;appName:string}
const statusLabels:Record<string,string>={paid:'Paid',pending:'Pending',processing:'Processing',expired:'Expired',failed:'Failed',refunded:'Refunded',unknown:'Status unavailable'}
export function appSetupSteps(app:App){return [
 {title:'Payment setup',done:app.settlementStatus==='ready',section:'setup' as PortalSection},
 ...(app.businessVerification ? [{title:'Business verification',done:app.businessVerification.status==='approved',section:'verification' as PortalSection}] : []),
 {title:'API key',done:app.keys.some(k=>!k.revokedAt&&(!k.expiresAt||Date.parse(k.expiresAt)>Date.now())&&(k.environment==='live'||k.prefix.startsWith('hpl_live_')||k.prefix.startsWith('hpl_app_'))),section:'keys' as PortalSection},
 {title:'Webhook',done:app.webhookConfigured,section:'webhooks' as PortalSection},
]}
export default function AccountHome({apps,onOpen,onCreate,onApps}:{apps:App[];onOpen:(id:string,section?:PortalSection)=>void;onCreate:()=>void;onApps:()=>void}){
 const {getAccessToken,user}=usePrivy()
 const [name,setName]=useState(''),[payments,setPayments]=useState<Payment[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[revision,setRevision]=useState(0)
 const ids=apps.map(a=>a.id+':'+a.name).join(',')
 useEffect(()=>{let active=true;const abort=new AbortController();const timer=setTimeout(()=>abort.abort(),20000);setPayments([]);setLoading(true);setError('');setName('')
  void(async()=>{try{const token=await getAccessToken();if(!token)throw Error('Sign in again to view your account.');const headers={authorization:'Bearer '+token};const profile=fetch('/api/developer-projects?resource=profile',{headers,signal:abort.signal}).then(r=>r.json()).then(d=>{if(active)setName(typeof d.profile?.name==='string'?d.profile.name.trim().split(/\s+/)[0]:'')}).catch(()=>{});
   const collected:Payment[]=[];let failed=0,index=0;
   const worker=async()=>{while(index<apps.length){const app=apps[index++];try{const response=await fetch('/api/developer-projects?'+new URLSearchParams({resource:'payments',projectId:app.id,limit:'10'}),{headers,cache:'no-store',signal:abort.signal});const data=await readActivityResponse(response);if(!Array.isArray(data.payments))throw Error('Missing payments');collected.push(...data.payments.map((p:Payment)=>({...p,projectId:app.id,appName:app.name})))}catch{failed++}}};
   await Promise.all([profile,...Array.from({length:Math.min(3,apps.length)},worker)]);if(active){setPayments(collected.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)||a.recordId.localeCompare(b.recordId)).slice(0,10));if(failed)setError(failed===apps.length?'Activity is unavailable right now.':'Activity for some apps could not be loaded.')}
  }catch(e){if(active)setError((e as Error).message)}finally{clearTimeout(timer);if(active)setLoading(false)}})();return()=>{active=false;clearTimeout(timer);abort.abort()}
 },[ids,user?.id,revision]) // eslint-disable-line react-hooks/exhaustive-deps
 const next=apps.find(app=>app.operationalStatus!=='suspended'&&appSetupSteps(app).some(s=>!s.done)),steps=next?appSetupSteps(next):[],done=steps.filter(s=>s.done).length
 const needingVerification=apps.filter(app=>app.businessVerification?.required&&app.businessVerification.status!=='approved')
 return <div className="account-home">
  {needingVerification.length>0&&<div className="account-notice"><p>{needingVerification.length===1?'One app needs business verification.':`${needingVerification.length} apps need business verification.`}</p><button onClick={()=>onOpen(needingVerification[0].id,'verification')}>Review verification <ArrowRight size={15}/></button></div>}
  <header className="account-heading"><div><p>Home</p><h1>{name?'Hello, '+name:'Welcome back'}</h1><p>One view of payments across your apps.</p></div><button className="developer-primary" onClick={onCreate}><Plus size={16}/>Create app</button></header>
  <dl className="account-metrics">{[['Apps',apps.length],['Payment-ready apps',apps.filter(a=>a.operationalStatus!=='suspended'&&appSetupSteps(a).every(s=>s.done)).length],['Verified apps',apps.filter(a=>a.businessVerification?.status==='approved').length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
  {!apps.length?<section className="account-setup"><h2>Start with your first app</h2><p>Create an app to configure payments and get your API credentials.</p><button className="developer-primary mt-5" onClick={onCreate}>Create your first app</button></section>:next?<section className="account-setup"><div className="account-setup-heading"><div><h2>Get {next.name} ready</h2><p>{steps.length-done} setup {steps.length-done===1?'step':'steps'} remaining</p></div><span>{Math.round(done/steps.length*100)}%</span></div><progress aria-label={'Setup progress for '+next.name} max={steps.length} value={done}/><div className="account-setup-steps">{steps.map(step=><button key={step.title} onClick={()=>onOpen(next.id,step.section)}><span className={step.done?'is-done':''}>{step.done?<Check size={15}/>:<ArrowRight size={15}/>}</span>{step.title}</button>)}</div></section>:null}
  <section className="account-recent"><div className="account-section-heading"><h2>Recent payments</h2><button onClick={onApps}>View apps <ArrowRight size={15}/></button></div>
   {error&&<div role="alert" className="mb-4 flex flex-wrap items-center gap-4 text-sm text-red-600"><p>{error}</p><button onClick={()=>setRevision(r=>r+1)} className="underline">Try again</button></div>}
   {loading?<div aria-label="Loading account activity" className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>)}</div>:payments.length?<div>{payments.map(p=><button key={p.projectId+':'+p.recordId} className="account-payment" onClick={()=>onOpen(p.projectId,'activity')}><div><strong>{p.appName}</strong><span>{new Date(p.createdAt).toLocaleString()}</span></div><div><strong>{p.amount} {p.asset}</strong><span className={p.status==='paid'?'text-emerald-600':''}>{statusLabels[p.status]??'Status unavailable'}</span></div><ArrowRight size={16}/></button>)}</div>:!error?<p className="account-empty">Your apps' payments will appear here.</p>:null}
  </section>
 </div>
}
