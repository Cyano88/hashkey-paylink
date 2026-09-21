import { useNavigate } from 'react-router-dom'
import PocketKycPanel from '../components/PocketKycPanel'
import PocketFlowHeader from '../components/PocketFlowHeader'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketVerifyNamePage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  return <div className="fixed inset-0 z-[45] overflow-y-auto bg-[#F5F5F7] text-gray-950 dark:bg-black dark:text-white">
    <main className="mx-auto min-h-full w-full max-w-[480px] px-5 pb-[max(2rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))]">
      <PocketFlowHeader title="Identity verification" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.profile)} />
      {authenticated ? <PocketKycPanel key={email} getAccessToken={getAccessToken} /> : <p className="mt-6 text-sm text-gray-500">Sign in to verify your identity.</p>}
    </main>
  </div>
}
