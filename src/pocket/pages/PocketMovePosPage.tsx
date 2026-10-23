import { useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PocketVerifiedNameGate from '../components/PocketVerifiedNameGate'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketLoadingState from '../components/PocketLoadingState'
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
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

const POS_COUNTRIES = [
  { key: 'NG', name: 'Nigeria', label: 'Live', status: 'live' as const, copy: 'Receive Naira in your bank account.' },
  { key: 'KE', name: 'Kenya', label: 'Coming soon', status: 'soon' as const, copy: '' },
  { key: 'GH', name: 'Ghana', label: 'Coming soon', status: 'soon' as const, copy: '' },
]

export default function PocketMovePosPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const verifiedIdentityName = profile.profile?.nameStatus === 'bank_resolved' ? profile.profile.resolvedName : ''
  const identityVerified = Boolean(verifiedIdentityName)
  const profileReady = Boolean(verifiedIdentityName && email)
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
    verifiedIdentityName,
    routeStep,
    onStepChange: changeStep,
  })

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
        ? pocketPathFor({ section: 'home', view: 'overview' })
        : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'overview' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'profile', view: 'details' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  if (authenticated && (!profile.loaded || profile.busy)) {
    return <PocketLoadingState active="home" />
  }

  return (
    <PocketRouteShell active="home" onSelect={selectNav}>
      <PocketFlowHeader centered rightAction={<button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.posManage)} className="min-h-10 px-1 text-xs font-bold">Manage</button>} title="POS" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      <PocketPosShell standalone>
        {authenticated && !identityVerified && (
          <PocketVerifiedNameGate />
        )}

        {authenticated && identityVerified && (!pos.country ? (
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
        ))}

        {!authenticated && <PocketPosSignInCard />}
      </PocketPosShell>
    </PocketRouteShell>
  )
}
