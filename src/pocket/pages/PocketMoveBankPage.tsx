import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, ChevronDown, Mail, Send } from '../components/PocketIcons'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { formatNgnAmount } from '../../lib/utils'
import PocketVerifiedNameGate, { PocketVerifiedNameBadge } from '../components/PocketVerifiedNameGate'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import PocketLoadingState from '../components/PocketLoadingState'
import PocketPaymentSuccess from '../components/PocketPaymentSuccess'
import PocketSlideAction from '../components/PocketSlideAction'
import usePocketBankReceiveController from '../controllers/usePocketBankReceiveController'
import usePocketBankWithdrawController, { PAYMENT_TIMEOUT_NOTICE } from '../controllers/usePocketBankWithdrawController'
import usePocketPaymentLiquidityController, { type PocketPaymentLiquidityPersistence } from '../controllers/usePocketPaymentLiquidityController'
import usePocketWalletController from '../controllers/usePocketWalletController'
import { readPocketBankWithdrawRoute, startPocketBankWithdrawRoute, updatePocketBankWithdrawRoute } from '../api/pocketBankWithdrawClient'
import {
  PocketFlexibleAmountToggle,
  PocketPaymentAmountField,
  PocketPaymentNoteField,
  PocketPayLinkSubmitPanel,
} from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import { PocketVerifiedBankFields } from '../features/move/PocketVerifiedBankFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import usePocketWallets from '../hooks/usePocketWallets'
import { pocketActivityReceipt } from '../lib/pocketReceipt'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

export default function PocketMoveBankPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const routeMode = (() => {
    const value = new URLSearchParams(window.location.search).get('mode')
    return value === 'request' || value === 'withdraw' ? value : ''
  })()
  const [mode, setModeState] = useState<'idle' | 'request' | 'withdraw'>(() => {
    if (routeMode) return routeMode
    const saved = window.sessionStorage.getItem('pocket:bank:mode')
    return saved === 'withdraw' ? saved : 'idle'
  })
  const [payoutToast, setPayoutToast] = useState('')
  const setMode = useCallback((next: 'idle' | 'request' | 'withdraw') => {
    window.sessionStorage.setItem('pocket:bank:mode', next)
    setModeState(next)
  }, [])
  const bank = usePocketBankReceiveController({
    authenticated,
    email,
    getAccessToken,
    profile: profile.profile,
    profileDraft: profile.draft,
    allowThirdPartyAccount: mode === 'withdraw',
  })
  const onWalletReady = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana', wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
    wallets.setWallets(current => ({ ...current, [network]: wallet }))
  }, [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const ensureBaseWallet = useCallback(async () => walletController.ensureWallet('base'), [walletController.ensureWallet])
  const getBaseEvmSession = useCallback((walletAddress: string) => walletController.getEvmSession('base', walletAddress), [walletController.getEvmSession])
  const ensureLiquidityWallet = useCallback((network: 'base' | 'arbitrum' | 'solana') => walletController.ensureWallet(network), [walletController.ensureWallet])
  const getLiquidityEvmSession = useCallback((network: 'base' | 'arbitrum', walletAddress: string) => walletController.getEvmSession(network, walletAddress), [walletController.getEvmSession])
  const getLiquiditySolanaSession = useCallback((walletAddress: string) => walletController.getSolanaSession(walletAddress), [walletController.getSolanaSession])
  const direct = usePocketBankWithdrawController({
    authenticated,
    email,
    firstName: profile.profile?.firstName || profile.draft.firstName,
    lastName: profile.profile?.lastName || profile.draft.lastName,
    bankCode: bank.bankCode,
    bankName: bank.bankName,
    accountNumber: bank.accountNumber,
    accountName: bank.accountName,
    bankVerified: bank.verified,
    wallet: wallets.wallets.base,
    ensureWallet: ensureBaseWallet,
    getEvmSession: getBaseEvmSession,
    getAccessToken,
    onSent: wallets.refreshBalances,
  })
  useEffect(() => {
    if (direct.error !== PAYMENT_TIMEOUT_NOTICE) return
    setPayoutToast(PAYMENT_TIMEOUT_NOTICE)
    const timer = window.setTimeout(() => setPayoutToast(''), 7_000)
    return () => window.clearTimeout(timer)
  }, [direct.error])
  const routePersistence = useMemo<PocketPaymentLiquidityPersistence | undefined>(() => {
    const intentId = direct.result?.intentId
    if (!intentId) return undefined
    return {
      read: accessToken => readPocketBankWithdrawRoute({ accessToken, intentId }),
      start: (accessToken, route) => {
        if (route.destination !== 'base' || route.source === 'base') throw new Error('Bank payout route is invalid.')
        return startPocketBankWithdrawRoute({ accessToken, intentId, source: route.source, amount: route.amount })
      },
      update: (accessToken, route) => updatePocketBankWithdrawRoute({ accessToken, intentId, phase: route.phase, txHash: route.txHash }),
    }
  }, [direct.result?.intentId])
  const bankLiquidity = usePocketPaymentLiquidityController({
    enabled: direct.status === 'routing' && Boolean(direct.result?.amountUsdc),
    amount: direct.result?.amountUsdc ?? '',
    destination: 'base',
    getAccessToken,
    ensureWallet: ensureLiquidityWallet,
    getEvmSession: getLiquidityEvmSession,
    getSolanaSession: getLiquiditySolanaSession,
    refreshBalances: wallets.refreshBalances,
    persistence: routePersistence,
  })
  const routedIntent = useRef('')
  useEffect(() => {
    const intentId = direct.result?.intentId ?? ''
    if (direct.status !== 'routing' || !intentId) {
      if (direct.status === 'idle') routedIntent.current = ''
      return
    }
    if (routedIntent.current === intentId) return
    routedIntent.current = intentId
    void bankLiquidity.ensureLiquidity()
      .then(wallet => direct.continueAfterRouting(wallet))
      .catch(reason => direct.failRouting(reason, intentId))
  }, [bankLiquidity.ensureLiquidity, direct.continueAfterRouting, direct.failRouting, direct.result?.intentId, direct.status])
  useEffect(() => {
    const intentId = direct.result?.intentId ?? ''
    if (direct.status !== 'route-review') return
    if (!intentId) return
    let cancelled = false
    const reconcile = async () => {
      while (!cancelled) {
        try {
          const wallet = await bankLiquidity.ensureLiquidity()
          if (!cancelled) await direct.continueAfterRouting(wallet)
          return
        } catch (reason) {
          if (cancelled) return
          direct.failRouting(reason, intentId)
          await new Promise(resolve => window.setTimeout(resolve, 2_500))
        }
      }
    }
    void reconcile()
    return () => { cancelled = true }
  }, [bankLiquidity.ensureLiquidity, direct.continueAfterRouting, direct.failRouting, direct.result?.intentId, direct.status])
  const directAmountDirty = direct.amount.length > 0
  const directAmountValid = /^\d+(?:\.\d{1,2})?$/.test(direct.amount) && Number(direct.amount) > 0
  const recoveredPayout = !directAmountValid && Boolean(direct.result?.intentId) && direct.status !== 'idle' && direct.status !== 'sent'
  const directSlideStatus = direct.status === 'sent'
    ? 'successful'
    : direct.status === 'pending' || direct.status === 'processing' || direct.status === 'route-review' || (direct.status === 'routing' && (bankLiquidity.status === 'waiting' || bankLiquidity.status === 'reconciling'))
      ? 'submitted'
      : direct.status === 'preparing' || direct.status === 'routing' || direct.status === 'authorizing'
        ? 'pending'
        : 'idle'
  const directLocked = direct.status === 'preparing' || direct.status === 'routing' || direct.status === 'route-review' || direct.status === 'authorizing' || direct.status === 'processing' || direct.status === 'pending'
  const bankReceipt = useMemo(() => (direct.status === 'sent' || direct.status === 'pending') && direct.result ? pocketActivityReceipt({
    eventId: `bank-withdraw:${direct.result.intentId}`,
    txHash: direct.result.txHash,
    chain: 'base',
    payer: wallets.wallets.base?.address || email || 'Pocket',
    memo: 'Direct bank payout',
    amount: direct.result.amountUsdc,
    amountNgn: direct.result.amountNgn,
    ts: Date.now(),
    source: 'bank-withdraw',
    merchantId: direct.result.merchantId,
    contextLabel: `${direct.result.bankName} ****${direct.result.bankLast4}`.trim(),
    settlementType: 'INSTANT_FIAT',
    paycrestStatus: direct.status === 'sent' ? 'successful' : 'pending',
    direction: 'out',
    recipient: direct.result.accountName,
    destination: `${direct.result.bankName} ****${direct.result.bankLast4}`.trim(),
    bankName: direct.result.bankName,
    bankLast4: direct.result.bankLast4,
    accountName: direct.result.accountName,
    providerReference: direct.result.orderId,
  }, { allowPending: true }) : null, [direct.result, direct.status, email, wallets.wallets.base?.address])

  useEffect(() => {
    if (selectedNet !== 'base') onNetworkSelect('base')
  }, [onNetworkSelect, selectedNet])

  const selectNav = (tab: PocketNavTab) => {
    const path = tab === 'home'
        ? pocketPathFor({ section: 'home', view: 'overview' })
        : tab === 'bills'
        ? pocketPathFor({ section: 'bills', view: 'airtime' })
        : tab === 'activity'
          ? pocketPathFor({ section: 'activity', view: 'all' })
          : pocketPathFor({ section: 'profile', view: 'details' })
    navigate(`${POCKET_BASE_PATH}${path}`)
  }

  if (authenticated && (!profile.loaded || !wallets.resolved || bank.institutionsBusy)) {
    return <PocketLoadingState active="home" />
  }

  return (
    <PocketRouteShell active="home" onSelect={selectNav}>
      {payoutToast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-[max(1rem,env(safe-area-inset-top))] z-[100] w-[min(calc(100%-2rem),26rem)] -translate-x-1/2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-950 shadow-xl dark:border-amber-400/30 dark:bg-amber-950 dark:text-amber-100">
          {payoutToast}
        </div>
      )}
      <PocketFlowHeader title={routeMode === 'request' ? 'Request' : 'Bank payout'} onBack={() => navigate(routeMode === 'request' ? `${POCKET_BASE_PATH}${POCKET_ROUTES.usdc}?flow=collection` : POCKET_BASE_PATH + POCKET_ROUTES.home)} />
      <div className="space-y-3.5">
        {routeMode === 'request' && <>
          <div className="grid grid-cols-2 gap-1 rounded-full bg-gray-200/70 p-1 dark:bg-white/[0.07]">
            <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.usdc)} className="min-h-10 rounded-full px-3 text-xs font-semibold text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-white">Request</button>
            <button type="button" className="min-h-10 rounded-full bg-gray-950 px-3 text-xs font-semibold text-white shadow-sm dark:bg-white dark:text-gray-950">Collection</button>
          </div>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-gray-100 p-1 dark:bg-white/[0.05]">
            <button type="button" onClick={() => navigate(POCKET_BASE_PATH + POCKET_ROUTES.usdc + '?flow=collection')} className="min-h-10 rounded-xl text-xs font-bold text-gray-500 dark:text-gray-400">USDC</button>
            <button type="button" className="min-h-10 rounded-xl bg-white text-xs font-bold text-gray-950 shadow-sm dark:bg-white/[0.1] dark:text-white">Local currency</button>
          </div>
          <section className="space-y-2 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
            <p className="text-[11px] font-bold text-gray-500 dark:text-gray-400">Collection country</p>
            <div className="flex min-h-14 items-center justify-between rounded-2xl border border-blue-200 bg-blue-50 px-4 dark:border-blue-400/20 dark:bg-blue-400/10"><span><span className="block text-sm font-bold">Nigeria</span><span className="mt-0.5 block text-[11px] text-gray-500 dark:text-gray-400">Collect in NGN</span></span><span className="rounded-full bg-blue-600 px-2.5 py-1 text-[9px] font-black uppercase text-white">Selected</span></div>
            {([['Ghana', 'GHS'], ['Kenya', 'KES']] as const).map(([country, currency]) => <div key={country} className="flex min-h-14 items-center justify-between rounded-2xl border border-gray-200 px-4 opacity-55 dark:border-white/10"><span><span className="block text-sm font-bold">{country}</span><span className="mt-0.5 block text-[11px] text-gray-400">Collect in {currency}</span></span><span className="rounded-full bg-gray-100 px-2.5 py-1 text-[9px] font-black uppercase text-gray-500 dark:bg-white/[0.08]">Soon</span></div>)}
            <p className="px-2 pt-1 text-center text-[11px] leading-5 text-gray-400 dark:text-gray-500">Nigeria is available now. Ghana and Kenya will unlock when their local payment rails are ready.</p>
          </section>
        </>}
        {!routeMode && <div className="grid grid-cols-1 gap-2">
          {([
            { key: 'withdraw', label: 'Direct Bank Payout', icon: Send, body: 'Withdraw Circle wallet USDC to your bank.' },
          ] as const).filter(option => mode === 'idle' || mode === option.key).map(option => {
            const Icon = option.icon
            const active = mode === option.key
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => setMode(active ? 'idle' : option.key)}
                className={`min-h-[62px] rounded-full border px-4 py-2.5 text-left shadow-sm transition-all active:scale-[0.98] ${active ? 'border-gray-950 bg-gray-950 text-white dark:border-white dark:bg-white dark:text-gray-950' : 'border-gray-200 bg-white text-gray-700 hover:border-blue-300 hover:bg-blue-50/70 dark:border-white/10 dark:bg-white/[0.04] dark:text-gray-200 dark:hover:border-blue-400/40 dark:hover:bg-blue-400/10'}`}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0 text-blue-500" />
                    <span className="min-w-0"><span className="block text-sm font-bold">{option.label}</span><span className={`mt-0.5 block text-[10px] ${active ? 'text-white/60 dark:text-gray-500' : 'text-gray-400'}`}>{option.body}</span></span>
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${active ? 'rotate-180' : ''}`} />
                </span>
              </button>
            )
          })}
        </div>}

        {mode !== 'idle' && <div className="space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{mode === 'request' ? 'Local-currency collection' : 'Direct bank payout'}</p>

          {!authenticated && (
            <div className="overflow-hidden rounded-[22px] bg-[#F5F5F7]/95 p-2 dark:bg-[#151518]/95">
              <PrivyConnectButton
                debugLabel="create-receive-bank"
                loginOptions={{ loginMethods: ['email'] }}
                logoutOnAuthenticated={false}
                className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]"
              >
                <Mail className="absolute left-5 h-4 w-4" />
                <span>Sign in to Pocket</span>
                <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </PrivyConnectButton>
              <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                Sign in to keep collections, bank payouts, receipts, and support connected to your Pocket.
              </p>
            </div>
          )}

          {authenticated && !bank.profileVerified && <PocketVerifiedNameGate />}

          {authenticated && bank.profileVerified && <fieldset disabled={mode === 'withdraw' && directLocked} aria-busy={mode === 'withdraw' && directLocked} onFocusCapture={() => { if (direct.status === 'sent') direct.resetResult() }} className="space-y-3.5">
            <PocketVerifiedNameBadge name={profile.profile?.resolvedName ?? ''} />

            <PocketVerifiedBankFields
              country={bank.country}
              institutions={bank.institutions}
              institutionsBusy={bank.institutionsBusy}
              bankCode={bank.bankCode}
              bankName={bank.bankName}
              accountNumber={bank.accountNumber}
              accountName={bank.accountName}
              verified={bank.verified}
              verifying={bank.verifying}
              error={bank.error}
              onCountryChange={bank.setCountry}
              onInstitutionChange={bank.setInstitution}
              onAccountChange={bank.setAccount}
              embedded
            />

            {mode === 'request' && <>
              <PocketPaymentAmountField
                lane="bank"
                flexible={bank.flexibleAmount}
                amount={bank.amount}
                dirty={bank.amountDirty}
                valid={bank.amountValid}
                helperText="Enter the NGN amount for this collection."
                onAmountChange={bank.setAmount}
              />

              <div className="border-y border-gray-100 py-3 dark:border-white/[0.07]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payer network</p>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Nigeria collections currently use Base USDC checkout.</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950">
                    Base
                  </span>
                </div>
              </div>

              <PocketPaymentNoteField value={bank.memo} onChange={bank.setMemo} />

              <PocketFlexibleAmountToggle
                lane="bank"
                enabled={bank.flexibleAmount}
                onToggle={() => bank.setFlexibleAmount(!bank.flexibleAmount)}
              />

              <PocketPayLinkSubmitPanel
                lane="bank"
                shellActive
                idle={!bank.generatedLink}
                canSubmit={bank.canSubmit}
                submitting={bank.busy}
                error={bank.error}
                onSubmit={() => void bank.submit()}
              />
            </>}

            {mode === 'withdraw' && <>
              <PocketPaymentAmountField
                lane="bank"
                flexible={false}
                amount={direct.amount}
                dirty={directAmountDirty}
                valid={directAmountValid}
                helperText="Enter the Naira amount to send to this bank account."
                onAmountChange={direct.setAmount}
              />

              <div className="border-y border-gray-100 py-3 dark:border-white/[0.07]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Withdrawal network</p>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Bank payouts settle from Base. Pocket can move USDC from another supported balance when needed.</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950">
                    Base
                  </span>
                </div>
              </div>

              <PocketPaymentNoteField value={direct.memo} onChange={direct.setMemo} />

              <div className="space-y-2 pt-1">
                {recoveredPayout ? (
                  <p className="rounded-2xl bg-gray-100 px-4 py-3 text-center text-xs font-medium text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                    Your previous payout is updating in Activity.
                  </p>
                ) : <PocketSlideAction
                  status={directSlideStatus}
                  disabled={!direct.canSubmit}
                  onPrepare={direct.prepareApproval}
                  onConfirm={() => void direct.submit()}
                  labels={{
                    idle: 'Confirm payout',
                    disabled: 'Complete payout details',
                    pending: direct.status === 'authorizing' ? 'Confirm payout in Circle' : direct.status === 'routing' && bankLiquidity.status === 'moving' ? 'Moving USDC' : direct.status === 'routing' ? 'Checking balances' : 'Preparing payout',
                    submitted: direct.status === 'route-review' ? 'USDC move confirming' : direct.status === 'routing' ? 'USDC moving to Base' : 'Payment processing',
                    successful: 'Sent',
                  }}
                />}
                {!recoveredPayout && direct.status === 'authorizing' && <p className="px-2 text-center text-xs font-medium text-blue-600 dark:text-blue-400">Approve the Circle confirmation to continue.</p>}
                {!recoveredPayout && direct.status === 'routing' && directAmountValid && bankLiquidity.notice && <p className="px-2 text-center text-xs text-gray-500 dark:text-gray-400">{bankLiquidity.notice}</p>}
                {!recoveredPayout && direct.error && direct.error !== PAYMENT_TIMEOUT_NOTICE && <p className="px-2 text-center text-xs font-medium text-red-500">{direct.error}</p>}
                {!direct.canSubmit && direct.status === 'idle' && !direct.error && <p className="px-2 text-center text-xs text-gray-400 dark:text-gray-500">Enter a verified beneficiary account and a Naira amount.</p>}
              </div>
            </>}

          </fieldset>}

        </div>}
      </div>

      {mode === 'request' && bank.generatedLink && (
        <PocketPayLinkReadyPanel
          url={bank.generatedLink}
          copied={bank.copied}
          flexible={bank.flexibleAmount}
          localCurrency
          amountLabel={formatNgnAmount(bank.amount)}
          networkLabel="Base"
          memo={bank.memo}
          eventMode={false}
          accessMode={false}
          dashboardUrl={bank.dashboardUrl}
          qrRef={bank.qrRef}
          qrHiResRef={bank.qrHiResRef}
          onReset={bank.reset}
          onDownloadQr={bank.downloadQr}
          onShare={() => void bank.share()}
        />
      )}

      <PayLinkShareSheet
        open={bank.shareOpen}
        url={bank.generatedLink}
        copied={bank.copied}
        shareText={bank.shareText}
        onCopy={bank.copy}
        onClose={bank.closeShare}
      />
      {mode === 'withdraw' && bankReceipt && (
        <PocketPaymentSuccess
          receipt={bankReceipt}
          outcome={direct.status === 'sent' ? 'handed-off' : 'pending'}
          onDone={() => {
            direct.resetResult()
            navigate(POCKET_BASE_PATH + POCKET_ROUTES.home)
          }}
        />
      )}
    </PocketRouteShell>
  )
}
