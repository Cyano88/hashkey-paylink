import { useLocation, useNavigate } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { QrCode, Receipt, Wifi, TrendingUp, ChevronRight } from '../components/PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { xpayOrigin } from '../lib/pocketXPayNavigation'

export default function PocketServicesPage() {
  const navigate = useNavigate(), location = useLocation()
  const origin = xpayOrigin(location.state)
  const open = (path: string) => navigate(POCKET_BASE_PATH + path, { state: { xpayOrigin: origin } })
  const items = [
    { title: 'XPay', detail: 'Pay and receive with QR', Icon: QrCode, path: POCKET_ROUTES.xpay },
    { title: 'Bills', detail: 'Airtime, data, electricity and TV', Icon: Receipt, path: POCKET_ROUTES.bills },
    { title: 'eSIM', detail: 'Mobile data for your next trip', Icon: Wifi, path: POCKET_ROUTES.esim, soon: true },
    { title: 'Earn', detail: 'Stablecoin yield', Icon: TrendingUp, path: null },
  ]
  return <PocketRouteShell active="services" rail={origin} refreshEnabled={false} onSelect={tab => open(tab === 'profile' ? POCKET_ROUTES.profile : POCKET_ROUTES.home)}>
    <PocketFlowHeader title="Services" centered hideBack />
    <section aria-label="Pocket services" className="mt-5 divide-y divide-gray-100 dark:divide-[#262626]">
      {items.map(({ title, detail, Icon, path, soon }) => <button key={title} type="button" disabled={!path} onClick={() => path && open(path)} className="flex min-h-24 w-full items-center gap-4 py-4 text-left enabled:active:scale-[0.99] transition-transform">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-gray-800 dark:bg-[#171717] dark:text-gray-200"><Icon className="h-6 w-6" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-gray-950 dark:text-white">{title}</span><span className="mt-1 block text-xs text-gray-500 dark:text-gray-400">{detail}</span></span>
        {(soon || !path) && <span className="text-xs text-gray-500 dark:text-gray-400">Coming soon</span>}
        {path && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
      </button>)}
    </section>
  </PocketRouteShell>
}
