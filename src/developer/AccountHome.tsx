import {useEffect,useState} from 'react'
import {usePrivy} from '@privy-io/react-auth'
import {ArrowRight,ArrowDownLeft,Check,Plus,ShieldCheck,Code2,Wallet} from 'lucide-react'
import type {ProjectSummary,PortalSection} from './PortalPanels'
import {readActivityResponse} from './activityResponse'

type App=ProjectSummary & {name:string}
type Payment={recordId:string;amount:string;asset:string;status:string;createdAt:string;projectId:string;appName:string}
const statusLabels:Record<string,string>={paid:'Paid',pending:'Pending',processing:'Processing',expired:'Expired',failed:'Failed',refunded:'Refunded',unknown:'Status unavailable'}
function hasLiveKey(app:App) {
 return app.keys.some(key=>!key.revokedAt&&(!key.expiresAt||Date.parse(key.expiresAt)>Date.now())&&(key.environment==='live'||key.prefix.startsWith('hpl_live_')||key.prefix.startsWith('hpl_app_')))
}
export function accountSetup(apps:App[]) {
 const eligible=apps.filter(app=>app.operationalStatus!=='suspended')
 const pending=eligible.find(app=>app.businessVerification?.status!=='approved')
 const verified=eligible.find(app=>app.businessVerification?.status==='approved')
 const configured=eligible.find(app=>app.settlementStatus==='ready')
 const connected=eligible.find(app=>hasLiveKey(app)&&app.webhookConfigured)
 return [
  {title:'Verify your business',copy:'Send your business details for review.',done:Boolean(verified)&&!eligible.some(app=>app.businessVerification?.required&&app.businessVerification.status!=='approved'),app:pending??verified,section:'verification' as PortalSection,icon:ShieldCheck},
  {title:'Set up payments',copy:'Choose where you receive your money.',done:Boolean(configured),app:configured??eligible[0],section:'setup' as PortalSection,icon:Wallet},
  {title:'Connect your app',copy:'Add your API key and payment updates.',done:Boolean(connected),app:connected??configured??eligible[0],section:'quickstart' as PortalSection,icon:Code2},
 ]
}
function paymentDate(value:string) {const date=new Date(value);return Number.isNaN(date.getTime())?'Date unavailable':date.toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'})}
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
 const steps=accountSetup(apps),done=steps.filter(step=>step.done).length,remaining=steps.length-done
 const verificationStep=steps[0],verificationPending=verificationStep.app?.businessVerification?.status==='submitted'
 function openStep(step:typeof steps[number]) {if(step.app)onOpen(step.app.id,step.section);else onCreate()}
 useEffect(()=>{const update=(event:Event)=>{const profile=(event as CustomEvent<{name:string}>).detail;if(typeof profile?.name==='string')setName(profile.name.trim().split(/\s+/)[0])};window.addEventListener('developer-profile-updated',update);return()=>window.removeEventListener('developer-profile-updated',update)},[])
 return <div className="account-home">
  {!verificationStep.done&&<div className="account-notice"><ShieldCheck size={17}/><p>{verificationPending?'Your business verification is being reviewed.':'Complete business verification to unlock live payments.'}</p><button onClick={()=>openStep(verificationStep)}>{verificationPending?'View verification':'Start verification'}<ArrowRight size={14}/></button></div>}
  <header className="account-heading"><div><h1>{name?'Hello, '+name:'Welcome back'}</h1><p>Your payments, connected in one place.</p></div><button className="developer-primary" onClick={onCreate}><Plus size={16}/>Create app</button></header>
  <section className="account-onboarding" aria-label="Account setup">
   <div className="account-onboarding-heading"><div><h2>{remaining?'Get ready to accept payments':'You are ready to accept payments'}</h2><p>{remaining?`${remaining} ${remaining===1?'step':'steps'} left to finish setting up your account.`:'Your business, payment destination and integration are set up.'}</p></div><div className="account-progress"><span>{Math.round(done/steps.length*100)}%</span><progress aria-label="Account setup progress" max={steps.length} value={done}/></div></div>
   <div className="account-checklist">{steps.map(step=>{const Icon=step.icon;return <button key={step.title} onClick={()=>openStep(step)} className={step.done?'is-complete':''}><span className="account-step-icon"><Icon size={21}/></span><div><h3>{step.title}</h3><p>{step.copy}</p></div><span className="account-step-state" aria-label={step.done?'Complete':'Not complete'}>{step.done?<Check size={15}/>:<ArrowRight size={15}/>}</span></button>})}</div>
  </section>
  <section className="account-recent"><div className="account-section-heading"><h2>Recent payments</h2><button onClick={onApps}>View apps <ArrowRight size={15}/></button></div>
   {error&&<div role="alert" className="mb-4 flex flex-wrap items-center gap-4 text-sm text-red-600"><p>{error}</p><button onClick={()=>setRevision(r=>r+1)} className="underline">Try again</button></div>}
   {loading?<div aria-label="Loading account activity" className="space-y-3">{[1,2,3].map(i=><div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5"/>)}</div>:payments.length?<div className="account-payment-table"><div className="account-payment-columns" aria-hidden="true"><span>Payment</span><span>App</span><span>Date</span><span>Status</span><span/></div>{payments.map(p=><button key={p.projectId+':'+p.recordId} className="account-payment" onClick={()=>onOpen(p.projectId,'activity')}><div className="account-payment-amount"><span className="account-payment-icon"><ArrowDownLeft size={18}/></span><div><strong>{p.amount} <span>{p.asset}</span></strong><small>{paymentDate(p.createdAt)}</small></div></div><span className="account-payment-app">{p.appName}</span><span className="account-payment-date">{paymentDate(p.createdAt)}</span><span className={'account-payment-status status-'+p.status}>{statusLabels[p.status]??'Status unavailable'}</span><ArrowRight className="account-payment-arrow" size={15}/></button>)}</div>:!error?<div className="account-payment-empty"><ArrowDownLeft size={24}/><h3>No payments yet</h3><p>Payments from all your apps will appear here.</p><button onClick={apps.length?onApps:onCreate}>{apps.length?'Explore your apps':'Create your first app'}<ArrowRight size={15}/></button></div>:null}
  </section>
 </div>
}
