import { useNavigate } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { CreditCard } from '../components/PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketCardsPage() {
  const navigate = useNavigate()
  const home = () => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)
  return <PocketRouteShell active="cards" onSelect={tab => navigate(POCKET_BASE_PATH + (tab === 'bills' ? POCKET_ROUTES.bills : tab === 'profile' ? POCKET_ROUTES.profile : tab === 'activity' ? POCKET_ROUTES.activity : tab === 'cards' ? POCKET_ROUTES.cards : POCKET_ROUTES.home))}>
    <PocketFlowHeader title="Cards" centered onBack={home} />
    <section aria-label="Cards coming soon" className="flex min-h-[calc(100dvh-310px)] flex-col items-center justify-center gap-4 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-[#171717] dark:text-gray-400"><CreditCard aria-hidden="true" className="h-8 w-8" /></span>
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Cards coming soon</p>
    </section>
  </PocketRouteShell>
}
