import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import PocketBottomSheet from '../components/PocketBottomSheet'
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
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor, pocketApiUrl } from '../lib/pocketRoutes'

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
  const [identityVerified, setIdentityVerified] = useState<boolean | null>(null)
  const [verifiedIdentityName, setVerifiedIdentityName] = useState('')
  const [verificationError, setVerificationError] = useState('')
  useEffect(() => {
    let current = true
    setIdentityVerified(null)
    setVerifiedIdentityName('')
    setVerificationError('')
    if (!authenticated) return
    void (async () => {
      try {
        const token = await getAccessToken()
        const response = await fetch(pocketApiUrl('/api/pocket/kyc'), { method: 'POST', headers: { authorization: `Bearer ${token || ''}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'eligibility' }), signal: AbortSignal.timeout(15000) })
        const data = await response.json()
        if (!response.ok || data.ok !== true) throw new Error('Verification could not load. Please try again.')
        if (current) { setIdentityVerified(data.verified === true); setVerifiedIdentityName(data.verified === true && typeof data.legalName === 'string' ? data.legalName : '') }
      } catch { if (current) { setIdentityVerified(false); setVerificationError('Verification could not load. Please try again from Profile.') } }
    })()
    return () => { current = false }
  }, [authenticated, email, getAccessToken])
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

  if (authenticated && (!profile.loaded || profile.busy || identityVerified === null)) {
    return <PocketLoadingState active="home" />
  }

  return (
    <PocketRouteShell active="home" onSelect={selectNav}>
      <PocketFlowHeader centered rightAction={<button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.posManage)} className="min-h-10 px-1 text-xs font-bold">Manage</button>} title="POS" onBack={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      <PocketPosShell standalone>
        {authenticated && !identityVerified && (
          <PocketBottomSheet title="Verification required" onClose={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)}>
            <h2 className="text-center text-lg font-semibold">Verification required</h2>
            <p className="mt-2 text-center text-sm leading-6 text-gray-500 dark:text-gray-400">{verificationError || 'Complete verification before setting up your POS.'}</p>
            <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.verifyName)} className="mt-6 w-full rounded-xl bg-gray-950 px-4 py-3.5 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Get verified</button>
            <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.posManage)} className="mt-2 w-full py-3 text-sm font-medium">Manage existing terminals</button>
            <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)} className="mt-2 w-full py-3 text-sm font-medium text-gray-500">Not now</button>
          </PocketBottomSheet>
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
