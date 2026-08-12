import { useNavigate } from 'react-router-dom'
import { Bell } from './PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketNotificationButton() {
  const navigate = useNavigate()
  return <button type="button" onClick={() => navigate(`${POCKET_BASE_PATH}${POCKET_ROUTES.notifications}`)} className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full text-gray-700 transition hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/[0.06]" aria-label="Open notifications"><Bell className="h-5 w-5" /></button>
}
