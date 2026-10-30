import type {BusinessVerification} from './verificationTypes'
import {CHECKOUT_PRODUCTS, productAllowed} from '../lib/developerProducts'

import { Link } from 'react-router-dom'
import { ArrowRight, Check, ChevronRight, Clock } from 'lucide-react'

export type PortalSection = 'overview' | 'products' | 'activity' | 'setup' | 'keys' | 'webhooks' | 'quickstart' | 'verification'
export const portalSections: Array<[PortalSection, string]> = [['overview','Overview'],['products','Payments'],['quickstart','Developers'],['setup','Settings']]
export function portalParent(section: PortalSection): PortalSection {
  if (section === 'verification') return 'setup'
  if (section === 'activity') return 'products'
  if (section === 'keys' || section === 'webhooks') return 'quickstart'
  return section
}
export const portalSubsections: Partial<Record<PortalSection, Array<[PortalSection, string]>>> = {
  setup: [['setup','App settings'],['verification','Verification']],
  products: [['products', 'Payment options'], ['activity', 'Activity']],
  quickstart: [['quickstart', 'Get started'], ['keys', 'API keys'], ['webhooks', 'Webhooks']],
}
export type ProjectSummary = {
  removal?:{status:string}
  accountType?: 'individual'|'business'; settlementMode?: string; personalKycVerified?: boolean; productionAccess?: boolean; enabledCapabilities?: string[];
  businessVerification?: BusinessVerification
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
    {title:'Configure your app',copy:'Choose where you receive payments.',done:project.settlementStatus==='ready',tab:'setup'},
    ...(project.businessVerification && project.productionAccess === false ? [{title:project.accountType === 'individual' ? 'Verify your identity' : 'Verify your business',copy:project.businessVerification.status==='submitted'?'Your application is under review.':'Submit your company and owner information.',done:project.businessVerification.status==='approved',tab:'verification' as PortalSection}] : []),
    {title:'Create an API key',copy:'Keep your key on your backend.',done:hasKey,tab:'keys'},
    {title:'Connect a webhook',copy:'Receive signed updates and handle retries.',done:project.webhookConfigured,tab:'webhooks'},
  ]
  const next=steps.find(step=>!step.done)
  const suspended=project.operationalStatus==='suspended'
  return <div>
    <p className="text-sm text-gray-500">Your app</p>
    <h1 className="mt-2 text-3xl font-semibold tracking-tight">{project.name}</h1>
    <div className="mt-4 inline-flex items-center gap-2 text-sm text-gray-500"><span className={'h-2 w-2 rounded-full '+(suspended?'bg-red-500':next?'bg-amber-400':'bg-emerald-500')}/>{suspended?'Payments paused':next?'Setup in progress':'Setup complete'}</div>
    <section className="mt-10 rounded-2xl border border-gray-200 p-6 dark:border-white/10 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{suspended?'Action needed':next?'Next step':'Ready to integrate'}</p>
      <h2 className="mt-3 text-xl font-semibold">{suspended?'Contact support':next?.title??'Connect your app'}</h2>
      <p className={'mt-2 '+muted}>{suspended?'Your project is paused. Contact support to restore payment access.':next?.copy??'Use the integration guide to connect your checkout.'}</p>
      {suspended?<a className="developer-primary mt-6" href="mailto:support@hashpaylink.com">Contact support</a>:<button type="button" onClick={()=>onNavigate(next?.tab??'quickstart')} className="developer-primary mt-6">{next?'Continue setup':'Open integration guide'}<ArrowRight className="h-4 w-4"/></button>}
    </section>
    <div className="mt-6 flex flex-wrap gap-x-6 gap-y-3 text-xs text-gray-500">{steps.map(step=><span key={step.tab} className="inline-flex items-center gap-2">{step.done?<Check className="h-3.5 w-3.5 text-emerald-600"/>:<span className="h-3 w-3 rounded-full border border-gray-300"/>}{step.title}</span>)}</div>
  </div>
}
export function ProductsPanel({project,onConfigure}:{project:ProjectSummary;onConfigure:()=>void}) {
  return <div><SectionTitle title="Payments" copy="Choose the payment flows your app offers."/>
    <div className="mt-6 divide-y divide-gray-100 dark:divide-white/10">{CHECKOUT_PRODUCTS.map(group=>{
      const options=group.options.filter(option=>productAllowed(project.checkoutMode,option.capability))
      if(!options.length)return null
      return <section key={group.id} className="py-5"><h2 className="text-base font-semibold">Payment options</h2>
        {options.map(option=><div key={option.capability} className="mt-4 flex items-start justify-between gap-4"><div><h3 className="text-sm font-semibold">{option.title}</h3><p className={muted}>{option.detail}</p></div><span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-white/5">{!project.capabilities.includes(option.capability)?'Not selected':project.operationalStatus==='suspended'?'Suspended':project.enabledCapabilities&&!project.enabledCapabilities.includes(option.capability)?'Verification required':project.settlementStatus==='ready'?'Configured':'Setup required'}</span></div>)}
      </section>
    })}</div><p className={'mt-4 '+muted}>Payment processing is available after setup and any required approval.</p><button type="button" onClick={onConfigure} className="developer-primary mt-6">Configure payments</button></div>
}
export function CliGuide({projectId}:{projectId:string}){return <div className="mt-6 rounded-2xl border border-gray-200 p-5 dark:border-white/10"><h2 className="text-base font-semibold">Connect the CLI</h2><p className={'mt-2 '+muted}>Optional: manage this project from your terminal. Keep secret API keys on your server. Customers approve their own payments.</p><pre className="mt-4 overflow-x-auto rounded-xl bg-gray-950 p-4 text-xs leading-6 text-white">{`hashpaylink auth login --project ${projectId} --json\nhashpaylink auth complete --json\nhashpaylink doctor --json`}</pre><Link to="/cli/authorize" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-blue-600 dark:text-blue-300">Manage CLI access<ChevronRight className="ml-1 h-4 w-4"/></Link></div>}

export function ComingSoonProducts() {
  return <section className="mt-10 border-t border-gray-200 pt-6 dark:border-white/10" aria-label="Coming soon">
    <h2 className="text-sm font-semibold text-gray-500">Coming soon</h2>
    <div className="mt-3 space-y-3 text-sm text-gray-500">
      <p>Agreements &amp; Hash PayStream</p>
      <p>Agent payments <span className="text-xs">(x402)</span></p>
    </div>
  </section>
}
