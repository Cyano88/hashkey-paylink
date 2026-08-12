import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Lock } from './PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketVerifiedNameGate() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.verifyName)} className="flex w-full items-center gap-3 rounded-[22px] border border-gray-200 bg-white p-4 text-left shadow-sm transition hover:border-gray-300 dark:border-white/10 dark:bg-white/[0.05] dark:hover:border-white/20">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600 dark:bg-white/[0.08] dark:text-gray-300"><Lock className="h-4 w-4" /></span>
    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold tracking-tight text-gray-950 dark:text-white">Link your bank name first</span><span className="mt-1 block text-xs leading-5 text-gray-500 dark:text-gray-400">Add your bank-resolved legal name in Profile before using Naira payouts.</span></span>
    <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
  </button>
}

export function PocketVerifiedNameBadge({ name }: { name: string }) {
  return <div className="flex items-center gap-3 rounded-[20px] border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-3.5 shadow-sm dark:border-emerald-400/20 dark:from-emerald-400/10 dark:to-white/[0.03]">
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check className="h-4 w-4 stroke-[2.5]" /></span>
    <span className="min-w-0"><span className="block text-[9px] font-semibold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">Verified name</span><span className="mt-0.5 block truncate text-sm font-semibold tracking-tight text-gray-950 dark:text-white">{name}</span></span>
  </div>
}
