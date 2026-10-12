import { useLocation, useNavigate } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { QrCode, Receipt, Wifi, ChevronRight } from '../components/PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { xpayOrigin } from '../lib/pocketXPayNavigation'

export default function PocketServicesPage() {
  const navigate = useNavigate(), location = useLocation()
  const origin = xpayOrigin(location.state)
  const open = (path: string) => navigate(POCKET_BASE_PATH + path, { state: { xpayOrigin: origin } })
  const items = [
    { title: 'XPay', Icon: QrCode, path: POCKET_ROUTES.xpay },
    { title: 'Bills', Icon: Receipt, path: POCKET_ROUTES.bills },
    { title: 'eSIM', Icon: Wifi, path: POCKET_ROUTES.esim },
  ]
  return <PocketRouteShell active="services" rail={origin} refreshEnabled={false} onSelect={tab => open(tab === 'profile' ? POCKET_ROUTES.profile : POCKET_ROUTES.home)}>
    <PocketFlowHeader title="Services" centered hideBack />
    <section aria-label="Pocket services" className="divide-y divide-gray-100 dark:divide-[#262626]">
      {items.map(({ title, Icon, path }) => <button key={title} type="button" onClick={() => open(path)} className="flex min-h-20 w-full items-center gap-4 px-1 py-4 text-left transition active:scale-[0.99]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-700 dark:bg-[#121212] dark:text-gray-200"><Icon className="h-5 w-5" /></span>
        <span className="flex-1 text-sm font-bold text-gray-950 dark:text-white">{title}</span>
        <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>)}
    </section>
  </PocketRouteShell>
}
