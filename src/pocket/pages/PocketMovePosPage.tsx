import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { LocalCurrencyProfileCard } from '../components/LocalCurrencyProfileCard'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketPosPageController, { type PocketPosRouteStep } from '../controllers/usePocketPosPageController'
import {
  PocketPosCountryPanel,
  PocketPosReadyPanel,
  PocketPosSetupPanel,
  PocketPosShell,
  PocketPosSignInCard,
} from '../features/move/PocketPosPanels'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'
const POS_COUNTRIES = [
  { key: 'NG', name: 'Nigeria', label: 'Live', status: 'live' as const, copy: 'Payers use Base USDC. You receive Naira to a verified bank account.' },
  { key: 'KE', name: 'Kenya', label: 'Coming soon', status: 'soon' as const, copy: 'Pending a verified local wallet or payout partner.' },
  { key: 'GH', name: 'Ghana', label: 'Coming soon', status: 'soon' as const, copy: 'Pending a verified local wallet or payout partner.' },
]

export default function PocketMovePosPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const profileReady = Boolean(profile.profile?.firstName && profile.profile?.lastName && (profile.profile.email || email))
  const stepParam = searchParams.get('posStep')
  const routeStep: PocketPosRouteStep = stepParam === 'setup' || stepParam === 'ready' ? stepParam : 'country'

  const changeStep = useCallback((step: PocketPosRouteStep) => {
    const params = new URLSearchParams()
    if (step !== 'country') params.set('posStep', step)
    const query = params.toString()
    navigate(`${POCKET_BASE_PATH}${pocketPathFor({ section: 'move', view: 'pos' })}${query ? `?${query}` : ''}`)
  }, [navigate])

  const pos = usePocketPosPageController({
    authenticated,
    email,
    getAccessToken,
    profile: profile.profile,
    profileReady,
    routeStep,
    onStepChange: changeStep,
  })

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
      ? pocketPathFor({ section: 'home', view: 'smart-wallet' })
      : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'move', view: 'usdc' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  return (
    <PocketRouteShell active="move" onSelect={selectNav}>
      <PocketPosShell standalone>
        {authenticated && (
          <LocalCurrencyProfileCard
            profile={profile.profile}
            draft={profile.draft}
            email={email}
            busy={profile.busy}
            error={profile.error}
            editing={profile.editing}
            bankAccountName={pos.bankAccountName}
            onDraftChange={profile.setDraft}
            onSave={() => void profile.save()}
            onEdit={profile.edit}
            onCancel={profile.cancel}
          />
        )}

        {!pos.country ? (
          <PocketPosCountryPanel
            controller={pos.controller}
            countries={POS_COUNTRIES}
            profileReady={Boolean(authenticated && profileReady)}
          />
        ) : !pos.merchant ? (
          <PocketPosSetupPanel
            controller={pos.controller}
            networkOptions={[{ key: 'base', label: 'Base' }]}
            instantBankPayout
            bankInstitutions={pos.institutions}
            bankInstitutionsBusy={pos.institutionsBusy}
            bankCode={pos.bankCode}
            bankAccount={pos.bankAccount}
            bankAccountName={pos.bankAccountName}
            bankVerified={pos.bankVerified}
            bankVerifyBusy={pos.bankVerifyBusy}
            error={pos.error}
          />
        ) : (
          <PocketPosReadyPanel
            customerUrl={pos.customerUrl}
            dashboardUrl={pos.dashboardUrl}
            displayName={pos.merchant.display_name}
            walletAddress={pos.merchant.circle_smart_wallet_address}
            copied={pos.copied}
            onCopy={() => void pos.copyCustomerUrl()}
          />
        )}

        {!authenticated && <PocketPosSignInCard />}
      </PocketPosShell>
    </PocketRouteShell>
  )
}
