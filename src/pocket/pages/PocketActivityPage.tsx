import { useNavigate } from 'react-router-dom'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketActivityPanel from '../features/activity/PocketActivityPanel'
import usePocketActivity from '../hooks/usePocketActivity'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { pocketPathFor, type PocketActivityView } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

export default function PocketActivityPage({ view }: { view: PocketActivityView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const activity = usePocketActivity({ authenticated, email, enabled: true, getAccessToken })

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
      ? pocketPathFor({ section: 'home', view: 'smart-wallet' })
      : tab === 'move'
        ? pocketPathFor({ section: 'move', view: 'usdc' })
        : tab === 'bills'
          ? pocketPathFor({ section: 'bills', view: 'airtime' })
          : pocketPathFor({ section: 'activity', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  return (
    <PocketRouteShell active="activity" onSelect={selectNav}>
      <PocketActivityPanel
        view={view}
        rows={activity.rows}
        authenticated={authenticated}
        busy={activity.busy}
        error={activity.error}
        onRefresh={() => void activity.refresh()}
      />
    </PocketRouteShell>
  )
}
