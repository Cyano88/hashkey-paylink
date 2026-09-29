import { useNavigate, useLocation } from 'react-router-dom'
import { ChevronRight, Lock } from './PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import PocketResolvedNameRow from './PocketResolvedNameRow'

export default function PocketIdentityGate() {
  const navigate = useNavigate()
  const location = useLocation()
  return <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.profile + '?feature=kyc', { state: { bankVerificationFrom: location.pathname + location.search } })} className="flex w-full items-center gap-3 rounded-[22px] border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300"><Lock className="h-4 w-4" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold tracking-tight text-gray-950 dark:text-white">Verify your identity</span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">Complete Basic verification to use bank payouts.</span></span>
    <ChevronRight className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
  </button>
}

export function PocketIdentityBadge({ name }: { name: string }) {
  return <PocketResolvedNameRow label="Verified name" name={name} />
}
