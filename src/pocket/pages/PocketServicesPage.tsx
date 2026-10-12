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
    { title: 'XPay', detail: 'QR payments', Icon: QrCode, path: POCKET_ROUTES.xpay },
    { title: 'Bills', detail: 'Airtime, data, electricity and TV', Icon: Receipt, path: POCKET_ROUTES.bills },
    { title: 'eSIM', detail: 'Travel data plans', Icon: Wifi, path: POCKET_ROUTES.esim },
  ]
  return <PocketRouteShell active="services" rail={origin} refreshEnabled={false} onSelect={tab => open(tab === 'profile' ? POCKET_ROUTES.profile : POCKET_ROUTES.home)}>
    <PocketFlowHeader title="Services" centered hideBack />
    <section aria-label="Pocket services" className="mt-5 space-y-3">
      {items.map(({ title, detail, Icon, path }) => <button key={title} type="button" onClick={() => open(path)} className="flex min-h-16 w-full items-center gap-3 rounded-[22px] bg-white p-4 text-left shadow-sm dark:bg-[#0D0D0D] dark:shadow-none">
        <Icon className="h-5 w-5 shrink-0 text-gray-500 dark:text-gray-300" />
        <span className="min-w-0 flex-1"><span className="block text-xs font-medium text-gray-500 dark:text-gray-400">{title}</span><span className="mt-1 block text-sm font-semibold">{detail}</span></span>
        <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>)}
    </section>
  </PocketRouteShell>
}
