import { useNavigate } from 'react-router-dom'
import PocketBottomSheet from './PocketBottomSheet'
import { Clock3, Lock } from './PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketKycGate({ pending = false, error = '', onClose, onManage }: { pending?: boolean; error?: string; onClose: () => void; onManage?: () => void }) {
  const navigate = useNavigate()
  const Icon = pending ? Clock3 : Lock
  const title = pending ? 'Verification review in progress' : 'Verify your identity'
  return <PocketBottomSheet title={title} onClose={onClose}>
    <div className="pb-2 pt-3 text-center">
      <Icon aria-hidden="true" className="mx-auto mb-5 h-16 w-16 text-blue-500" />
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error || (pending ? 'Your identity check is being processed. View your verification to check its progress.' : 'Complete identity verification to use this feature.')}</p>
      <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.verifyName)} className="mt-7 w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">{pending ? 'View verification' : 'Get verified'}</button>
      {onManage && <button type="button" onClick={onManage} className="mt-2 w-full py-3 text-sm font-medium">Manage existing terminals</button>}
    </div>
  </PocketBottomSheet>
}
