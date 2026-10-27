import { ArrowRight, AppWindow, Plus } from 'lucide-react'

type App = { id: string; name: string; website: string; settlementStatus: string; operationalStatus?: string }
export default function AppsPanel({apps, onOpen, onCreate, disabled}: {
  apps: App[]; onOpen: (id: string) => void; onCreate: () => void; disabled: boolean
}) {
  return <div>
    <header className="flex items-start justify-between gap-4">
      <div><h1 className="text-2xl font-semibold tracking-tight">Apps</h1><p className="mt-2 text-sm text-gray-500">Manage payments for your apps.</p></div>
      {apps.length > 0 && <button disabled={disabled} onClick={onCreate} className="developer-primary shrink-0 whitespace-nowrap"><Plus className="h-4 w-4"/>Create app</button>}
    </header>
    {!apps.length ? <section className="flex min-h-80 flex-col items-center justify-center text-center">
      <AppWindow className="h-8 w-8 text-gray-400"/>
      <h2 className="mt-5 text-xl font-semibold">Create your first app</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-gray-500">Accept payments with the Hash PayLink API.</p>
      <button disabled={disabled} onClick={onCreate} className="developer-primary mt-6"><Plus className="h-4 w-4"/>Create app</button>
    </section> : <div className="mt-8 grid gap-4 sm:grid-cols-2">{apps.map(app => <button key={app.id} disabled={disabled} onClick={()=>onOpen(app.id)} className="group rounded-2xl border border-gray-200 p-5 text-left transition hover:border-gray-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/10 dark:hover:border-white/30">
      <div className="flex items-center justify-between gap-3"><h2 className="truncate font-semibold">{app.name}</h2><ArrowRight className="h-4 w-4 shrink-0 text-gray-400"/></div>
      <p className="mt-2 truncate text-sm text-gray-500">{app.website || 'Complete your app setup'}</p>
      <p className="mt-6 flex items-center gap-2 text-xs text-gray-500"><span className={'h-1.5 w-1.5 rounded-full '+(app.operationalStatus==='suspended'?'bg-red-500':app.settlementStatus==='ready'?'bg-emerald-500':'bg-amber-400')}/>{app.operationalStatus==='suspended'?'Payments paused':app.settlementStatus==='ready'?'Configured':'Setup required'}</p>
    </button>)}</div>}
  </div>
}
