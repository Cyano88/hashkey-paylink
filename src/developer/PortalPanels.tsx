import {CHECKOUT_PRODUCTS, productAllowed} from '../lib/developerProducts'

import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight, Clock } from 'lucide-react'

export type PortalSection = 'overview' | 'products' | 'activity' | 'setup' | 'keys' | 'webhooks' | 'quickstart'
export const portalSections: Array<[PortalSection, string]> = [['overview','Overview'],['products','Products'],['activity','Activity'],['keys','API keys'],['webhooks','Webhooks'],['quickstart','Docs'],['setup','Settings']]
export type ProjectSummary = {
  id: string; name: string; checkoutMode: 'human' | 'agentic'; capabilities: string[]; networks: string[];
  settlementStatus: string; operationalStatus?: string; webhookConfigured: boolean;
  keys: Array<{ revokedAt?: string; expiresAt?: string; environment?: string; prefix: string }>;
  webhookDeliveries?: Array<{id:string; event:string; status:string; attemptedAt:string; responseStatus?:number; error?:string}>;
}
const muted='text-sm leading-6 text-gray-500 dark:text-gray-400'
export function SectionTitle({title,copy}:{title:string;copy:string}) { return <header><h1 className="text-2xl font-semibold tracking-tight">{title}</h1><p className={'mt-2 '+muted}>{copy}</p></header> }
export function OverviewPanel({project,onNavigate}:{project:ProjectSummary;onNavigate:(tab:PortalSection)=>void}) {
  const hasKey=project.keys.some(k=>!k.revokedAt && (!k.expiresAt||Date.parse(k.expiresAt)>Date.now()) && (k.environment==='live'||k.prefix.startsWith('hpl_live_')||k.prefix.startsWith('hpl_app_')))
  const steps: Array<{title:string;copy:string;done:boolean;tab:PortalSection}> = [
    {title:'Configure your project',copy:'Choose where you receive payments.',done:project.settlementStatus==='ready',tab:'setup'},
    {title:'Create an API key',copy:'Keep your key on your backend.',done:hasKey,tab:'keys'},
    {title:'Connect a webhook',copy:'Receive signed updates and handle retries.',done:project.webhookConfigured,tab:'webhooks'},
  ]
  const next=steps.find(step=>!step.done)
  return <div><SectionTitle title={project.name} copy="Your project setup and next steps, in one place." />
    {project.operationalStatus==='suspended'&&<p role="status" className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">This project is suspended. Contact support before processing new payments.</p>}
    <div className="mt-6 flex flex-wrap gap-2 text-xs text-gray-600 dark:text-gray-300"><span className="rounded-full bg-gray-100 px-3 py-2 dark:bg-white/5">{project.checkoutMode==='agentic'?'Legacy agent':'Checkout'} project</span><span className="rounded-full bg-gray-100 px-3 py-2 dark:bg-white/5">{steps.filter(s=>s.done).length} of 3 setup steps complete</span></div>
    <div className="mt-6 divide-y divide-gray-100 dark:divide-white/10">{steps.map(step=><button key={step.tab} type="button" onClick={()=>onNavigate(step.tab)} className="flex w-full items-center gap-4 py-5 text-left"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gray-100 dark:bg-white/5">{step.done?<Check className="h-4 w-4 text-emerald-600"/>:<Clock className="h-4 w-4 text-gray-500"/>}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{step.title}</span><span className={'block '+muted}>{step.copy}</span></span><ChevronRight className="h-4 w-4 shrink-0 text-gray-400"/></button>)}</div>
    <button type="button" onClick={()=>onNavigate(next?.tab??'quickstart')} className="developer-primary mt-6">{next?next.title:'Open integration guide'}<ArrowRight className="h-4 w-4"/></button>
    <p className={'mt-4 '+muted}>Complete setup before accepting your first payment.</p>
  </div>
}
export function ProductsPanel({project,onConfigure}:{project:ProjectSummary;onConfigure:()=>void}) {
  return <div><SectionTitle title="Products" copy="Choose how customers pay in your app."/>
    <div className="mt-6 divide-y divide-gray-100 dark:divide-white/10">{CHECKOUT_PRODUCTS.map(group=>{
      const options=group.options.filter(option=>productAllowed(project.checkoutMode,option.capability))
      if(!options.length)return null
      return <section key={group.id} className="py-5"><h2 className="text-base font-semibold">Payment options</h2>
        {options.map(option=><div key={option.capability} className="mt-4 flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">{option.title}</h3><p className={muted}>{option.detail}</p></div><span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-white/5">{!project.capabilities.includes(option.capability)?'Not selected':project.operationalStatus==='suspended'?'Suspended':project.settlementStatus==='ready'?'Configured':'Setup required'}</span></div>)}
      </section>
    })}</div><p className={'mt-4 '+muted}>Payment processing is available after setup and any required approval.</p><button type="button" onClick={onConfigure} className="developer-primary mt-6">Configure payments</button><ComingSoonProducts/></div>
}
export function CliGuide({projectId}:{projectId:string}){return <div className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-white/10"><h2 className="text-base font-semibold">Connect the CLI</h2><p className={'mt-2 '+muted}>Optional: manage this project from your terminal. Keep secret API keys on your server. Customers approve their own payments.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-white">{`hashpaylink auth login --project ${projectId} --json\nhashpaylink auth complete --json\nhashpaylink doctor --json`}</pre><Link to="/cli/authorize" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-blue-600 dark:text-blue-300">Manage CLI access<ChevronRight className="ml-1 h-4 w-4"/></Link></div>}

function ComingSoonProducts() {
  return <section className="mt-10 border-t border-gray-200 pt-6 dark:border-white/10" aria-label="Coming soon">
    <h2 className="text-sm font-semibold text-gray-500">Coming soon</h2>
    <div className="mt-3 space-y-3 text-sm text-gray-500">
      <p>Agreements &amp; Hash PayStream</p>
      <p>Agent payments <span className="text-xs">(x402)</span></p>
    </div>
  </section>
}
