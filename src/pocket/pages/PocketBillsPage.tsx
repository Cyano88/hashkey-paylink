import { useNavigate } from 'react-router-dom'
import { LocalCurrencyProfileCard } from '../components/LocalCurrencyProfileCard'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketBillsPanel from '../features/bills/PocketBillsPanel'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { pocketPathFor, type PocketBillView } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

export default function PocketBillsPage({ view }: { view: PocketBillView }) {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
      ? pocketPathFor({ section: 'home', view: 'smart-wallet' })
      : tab === 'move'
        ? pocketPathFor({ section: 'move', view: 'usdc' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'bills', view })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  return (
    <PocketRouteShell active="bills" onSelect={selectNav}>
      <PocketBillsPanel
        view={view}
        authenticated={authenticated}
        profileSlot={(
          <LocalCurrencyProfileCard
            profile={profile.profile}
            draft={profile.draft}
            email={email}
            busy={profile.busy}
            error={profile.error}
            editing={profile.editing}
            onDraftChange={profile.setDraft}
            onSave={profile.save}
            onEdit={profile.edit}
            onCancel={profile.cancel}
          />
        )}
      />
    </PocketRouteShell>
  )
}
