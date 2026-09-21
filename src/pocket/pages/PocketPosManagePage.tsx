import { useNavigate, useSearchParams } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketRecentActivitySkeleton from '../components/PocketRecentActivitySkeleton'
import PocketResourceActivityPanel from '../features/activity/PocketResourceActivityPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketActivity from '../hooks/usePocketActivity'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'

export default function PocketPosManagePage() {
  const navigate = useNavigate()
  const [params,setParams] = useSearchParams()
  const {authenticated,email,getAccessToken} = usePocketIdentity()
  const activity = usePocketActivity({authenticated,email,getAccessToken,enabled:true})
  return <PocketRouteShell active="home" onSelect={tab => navigate(POCKET_BASE_PATH + (tab === 'bills' ? POCKET_ROUTES.bills : tab === 'profile' ? POCKET_ROUTES.profile : tab === 'activity' ? POCKET_ROUTES.activity : POCKET_ROUTES.home))}>
    <PocketFlowHeader centered title="POS terminals" onBack={() => params.has('terminal') ? setParams({}) : navigate(POCKET_BASE_PATH + POCKET_ROUTES.pos)} />
    {!activity.resolved ? <PocketRecentActivitySkeleton /> : <PocketResourceActivityPanel view="pos" rows={activity.rows} merchants={activity.merchants} collections={[]} requests={[]} busy={activity.busy} error={activity.error} />}
  </PocketRouteShell>
}
