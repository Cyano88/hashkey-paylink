import PocketFiatUsdcEstimate from '../components/PocketFiatUsdcEstimate'
import PocketBankKycBoundary from '../components/PocketBankKycBoundary'
import usePocketFxQuote from '../hooks/usePocketFxQuote'
import { formatPocketPaymentAmount } from '../lib/pocketMoney'
import PocketPayoutCountry from '../components/PocketPayoutCountry'
import { pocketFiatCurrency } from '../lib/pocketFiatCorridors'
import PocketBankAmountFields from '../components/PocketBankAmountFields'
import PocketBankRecipients from '../components/PocketBankRecipients'
import usePocketBankRecipients, { type PocketBankRecipient } from '../hooks/usePocketBankRecipients'
import PocketConfirmationDetails from '../components/PocketConfirmationDetails'
import usePocketSlowConfirmation from '../hooks/usePocketSlowConfirmation'
import { readCachedPocketBalance, balanceOwner } from '../lib/pocketBalanceCache'
import PocketBottomSheet from '../components/PocketBottomSheet'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Mail } from '../components/PocketIcons'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { formatNgnAmount } from '../../lib/utils'
import PocketIdentityGate, { PocketIdentityBadge } from '../components/PocketIdentityGate'
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

export default function PocketMoveBankPage(){return <PocketBankKycBoundary><PocketMoveBankContent/></PocketBankKycBoundary>}
function PocketMoveBankContent() {
  const navigate = useNavigate()
  const { search, state: locationState } = useLocation()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const routeMode = new URLSearchParams(search).get('mode') === 'request' ? 'request' : 'withdraw'
  const mode = routeMode
  const [recipientStep,setRecipientStep] = useState(false)
  const [recipientTab,setRecipientTab] = useState<'recent'|'favourites'>('recent')
  const directory = new URLSearchParams(search).get('recipients')
  const recipients = usePocketBankRecipients({email,enabled:authenticated && mode==='withdraw',getAccessToken})
  const closeDirectory = () => locationState?.bankRecipientDirectory ? navigate(-1) : navigate(POCKET_BASE_PATH + POCKET_ROUTES.bank + '?mode=withdraw', {replace:true})
  const [reviewOpen, setReviewOpen] = useState(false)
  useEffect(() => { const close=()=>setReviewOpen(false);window.addEventListener('pocket:kyc-required',close);return()=>window.removeEventListener('pocket:kyc-required',close) }, [])
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [payoutToast, setPayoutToast] = useState('')

  const bank = usePocketBankReceiveController({
    authenticated,
    email,
    getAccessToken,
    profile: profile.profile,
    profileDraft: profile.draft,
    allowThirdPartyAccount: mode === 'withdraw',
  })
  const reviewFx = usePocketFxQuote(1, reviewOpen, bank.country === 'UG' ? 'UGX' : 'NGN')
  const pickRecipient = (recipient: PocketBankRecipient) => {
    if ((recipient.country || 'NG') !== bank.country) return
    setRecipientStep(false)
    bank.setInstitution(recipient.bankCode,recipient.bankName,false)
    bank.setAccount(recipient.accountNumber)
    if (directory) closeDirectory()
  }
  useEffect(()=>{setRecipientStep(false)},[bank.accountNumber,bank.bankCode,mode])
  const recipientList = (expanded=false) => <PocketBankRecipients rows={recipients.rows.filter(row=>(row.country || 'NG') === bank.country)} busy={recipients.busy} error={recipients.error} tab={expanded ? (directory==='favourites'?'favourites':'recent') : recipientTab} onTab={setRecipientTab} onSelect={pickRecipient} onToggle={row=>void recipients.toggle(row)} onRetry={()=>void recipients.refresh()} expanded={expanded} onViewAll={()=>navigate(POCKET_BASE_PATH+POCKET_ROUTES.bank+'?mode=withdraw&recipients='+recipientTab,{state:{bankRecipientDirectory:true}})} />
  const onWalletReady = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana' | 'ethereum' | 'polygon', wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
    wallets.setWallets(current => ({ ...current, [network]: wallet }))
  }, [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const ensureBaseWallet = useCallback(async () => walletController.ensureWallet('base'), [walletController.ensureWallet])
  const getBaseEvmSession = useCallback((walletAddress: string) => walletController.getEvmSession('base', walletAddress), [walletController.getEvmSession])
  const ensureLiquidityWallet = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana' | 'ethereum' | 'polygon') => walletController.ensureWallet(network), [walletController.ensureWallet])
  const getLiquidityEvmSession = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'ethereum' | 'polygon', walletAddress: string) => walletController.getEvmSession(network, walletAddress), [walletController.getEvmSession])
  const getLiquiditySolanaSession = useCallback((walletAddress: string) => walletController.getSolanaSession(walletAddress), [walletController.getSolanaSession])
  const direct = usePocketBankWithdrawController({
    country: bank.country,
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
      start: async (accessToken, route) => {
        if (route.destination !== 'base' || route.source === 'base') throw new Error('Bank payout route is invalid.')
        const checkpoint = await startPocketBankWithdrawRoute({ accessToken, intentId, source: route.source, amount: route.amount })
        if (!checkpoint) throw new Error('The bank payout route could not be prepared.')
        return checkpoint
      },
      update: (accessToken, route) => updatePocketBankWithdrawRoute({ accessToken, intentId, phase: route.phase, txHash: route.txHash }),
    }
  }, [direct.result?.intentId])
  const readRoutingSnapshot = useCallback(() => readCachedPocketBalance(balanceOwner(email)), [email])
  const bankLiquidity = usePocketPaymentLiquidityController({
    funding: direct.result?.intentId ? {kind:'bank-withdraw',id:direct.result.intentId} : undefined,
    bankPayout: true,
    readRoutingSnapshot,
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
  const slowConfirmation=usePocketSlowConfirmation(['pending','processing'].includes(direct.status),direct.result?.intentId||'',60_000,direct.confirming)
  const bankTerminal=direct.result?.handoffVerified===true||['failed','refunded','sent'].includes(direct.result?.state||'')
  const bankReceipt = useMemo(() => (reviewOpen && (bankTerminal || slowConfirmation)) && direct.result ? pocketActivityReceipt({
    paymentFunding: bankLiquidity.paymentFunding,
    eventId: `bank-withdraw:${direct.result.intentId}`,
    txHash: direct.result.txHash,
    chain: 'base',
    payer: wallets.wallets.base?.address || email || 'Pocket',
    memo: 'Bank transfer',
    amount: direct.result.amountUsdc,
    amountNgn: direct.result.amountNgn,
    fiatCurrency: direct.result.fiatCurrency,
    ts: Date.now(),
    source: 'bank-withdraw',
    merchantId: direct.result.merchantId,
    contextLabel: `${direct.result.bankName} ****${direct.result.bankLast4}`.trim(),
    settlementType: 'INSTANT_FIAT',
    handoffVerified: direct.result.handoffVerified,
    bankSettlementStatus: direct.result.providerStatus || 'pending',
    paycrestStatus: direct.result.providerStatus || 'pending',
    direction: 'out',
    recipient: direct.result.accountName,
    destination: `${direct.result.bankName} ****${direct.result.bankLast4}`.trim(),
    bankName: direct.result.bankName,
    bankLast4: direct.result.bankLast4,
    accountName: direct.result.accountName,
    providerReference: direct.result.orderId,
  }, { allowPending: true }) : null, [direct.result, bankLiquidity.paymentFunding, direct.status, email, wallets.wallets.base?.address, reviewOpen, bankTerminal, slowConfirmation])

  useEffect(() => {
    if (selectedNet !== 'base') onNetworkSelect('base')
  }, [onNetworkSelect, selectedNet])

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

  if (authenticated && ((!profile.loaded && !profile.profile) || !wallets.resolved)) {
    return <PocketLoadingState active="home" />
  }

  if (mode==='withdraw' && directory) return <PocketRouteShell active="home" onSelect={selectNav}><PocketFlowHeader centered title={directory==='favourites'?'Favourites':'Recent transfers'} onBack={closeDirectory}/>{recipientList(true)}</PocketRouteShell>

  return (
    <PocketRouteShell active="home" onSelect={selectNav} fixedPage={mode === "withdraw" && recipientStep}>
      {payoutToast && (
        <div role="status" aria-live="polite" className="fixed left-1/2 top-[max(1rem,var(--pocket-safe-top))] z-[100] w-[min(calc(100%-2rem),26rem)] -translate-x-1/2 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-center text-sm font-semibold text-gray-600 shadow-xl dark:border-[#262626] dark:bg-[#121212] dark:text-gray-300">
          {payoutToast}
        </div>
      )}
      <PocketFlowHeader centered title={routeMode === 'request' ? 'Create collection' : recipientStep ? 'Enter amount' : 'Bank transfer'} onBack={() => recipientStep ? setRecipientStep(false) : navigate(routeMode === 'request' ? `${POCKET_BASE_PATH}${POCKET_ROUTES.usdc}?flow=collection` : POCKET_BASE_PATH + POCKET_ROUTES.transfer)} />
      <div className={mode === "withdraw" && recipientStep ? "flex min-h-0 min-w-0 w-full flex-1 flex-col" : "min-w-0 w-full space-y-3.5"}>
        {routeMode === 'request' && <div className="flex items-center gap-3 py-2"><img src="/brand/countries/ng.svg" alt="" className="h-[21px] w-7 rounded-sm" /><div><p className="text-sm font-semibold">Nigeria</p><p className="text-xs text-gray-500 dark:text-gray-400">Receive NGN in your bank account</p></div></div>}


        <div className={mode === "withdraw" && recipientStep ? "flex min-h-0 flex-1 flex-col" : "space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-sm dark:border-[#262626] dark:bg-[#0D0D0D] dark:shadow-none"}>


          {!authenticated && (
            <div className="overflow-hidden rounded-[22px] bg-[#F5F5F7]/95 p-2 dark:bg-[#121212]/95">
              <PrivyConnectButton
                debugLabel="create-receive-bank"
                loginOptions={{ loginMethods: ['email'] }}
                logoutOnAuthenticated={false}
                className="pocket-cta-primary group relative flex w-full items-center justify-center px-16 py-1.5 text-center transition-all"
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

          {authenticated && !bank.profileVerified && <PocketIdentityGate />}

          {authenticated && bank.profileVerified && <fieldset disabled={mode === 'withdraw' && directLocked} aria-busy={mode === 'withdraw' && directLocked} onFocusCapture={() => { if (direct.status === 'sent') direct.resetResult() }} className={mode === "withdraw" && recipientStep ? "flex min-h-0 min-w-0 w-full flex-1 flex-col" : "min-w-0 w-full space-y-3.5"}>
            {mode === 'request' && <PocketIdentityBadge name={profile.profile?.resolvedName ?? ''} />}

            <div hidden={mode === 'withdraw' && recipientStep} className="space-y-3">{mode === 'withdraw' && <PocketPayoutCountry value={bank.country} onChange={value=>{bank.setCountry(value);direct.setAmount('');setReviewOpen(false)}} />}<PocketVerifiedBankFields
              recipientEntry={mode === 'withdraw'}
              country={bank.country}
              institutions={bank.institutions}
              institutionsBusy={bank.institutionsBusy}
              bankCode={bank.bankCode}
              bankName={bank.bankName}
              accountNumber={bank.accountNumber}
              accountName={bank.accountName}
              nameRequired={bank.nameRequired}
              onRecipientNameChange={bank.setRecipientName}
              verified={bank.verified}
              verifying={bank.verifying}
              error={bank.error}
              onCountryChange={bank.setCountry}
              onInstitutionChange={bank.setInstitution}
              onAccountChange={bank.setAccount}
              onRetry={() => { void bank.verify() }}
              embedded
            /></div>
            {mode==='withdraw' && !recipientStep && <button type="button" disabled={!bank.verified || bank.verifying || directLocked} onClick={()=>setRecipientStep(true)} className="pocket-cta-primary w-full">Continue</button>}

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

              <div className="border-y border-gray-100 py-3 dark:border-[#262626]">
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

            {mode === 'withdraw' && recipientStep && <div className="pocket-bank-amount-page flex min-h-0 flex-1 flex-col gap-5">
              <PocketBankAmountFields currency={pocketFiatCurrency(bank.country)} accountName={bank.accountName} bankName={bank.bankName} accountNumber={bank.accountNumber} amount={direct.amount} memo={direct.memo} disabled={directLocked} onChangeRecipient={()=>setRecipientStep(false)} onAmountChange={direct.setAmount} onMemoChange={direct.setMemo} />

              <PocketFiatUsdcEstimate amount={Number(direct.amount)} currency={pocketFiatCurrency(bank.country)} />
              <div className="mt-auto space-y-2 pt-6" style={{ visibility: reviewOpen || bankReceipt ? 'hidden' : undefined }}>
                {recoveredPayout ? (
                  <p className="rounded-2xl bg-gray-100 px-4 py-3 text-center text-xs font-medium text-gray-600 dark:bg-[#121212] dark:text-gray-300">
                    Your previous payout is updating in Activity.
                  </p>
                ) : <button type="button" disabled={!direct.canSubmit || approvalBusy} onClick={() => setReviewOpen(true)} className="pocket-cta-primary w-full">Continue</button>}
                {!reviewOpen && !recoveredPayout && direct.status === 'authorizing' && <p className="px-2 text-center text-xs font-medium text-blue-600 dark:text-blue-400">Approve the Circle confirmation to continue.</p>}
                {!reviewOpen && !recoveredPayout && direct.status === 'routing' && directAmountValid && ['moving', 'waiting', 'reconciling'].includes(bankLiquidity.status) && bankLiquidity.notice && <p className="px-2 text-center text-xs text-gray-500 dark:text-gray-400">{bankLiquidity.notice}</p>}
                {!reviewOpen && !recoveredPayout && direct.error && direct.error !== PAYMENT_TIMEOUT_NOTICE && <p className="px-2 text-center text-xs font-medium text-red-500">{direct.error}</p>}
              </div>
            </div>}

          </fieldset>}

        </div>
        {mode==='withdraw' && !recipientStep && authenticated && recipientList()}
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
      {mode === 'withdraw' && reviewOpen && !bankReceipt && <PocketBottomSheet title="Confirm payment" showCloseButton dismissOnBackdrop={false} dismissible={!approvalBusy && !directLocked} onClose={() => setReviewOpen(false)}>
        <PocketConfirmationDetails equivalent={direct.result?.amountUsdc ? formatPocketPaymentAmount(Number(direct.result.amountUsdc)) + ' USDC' : reviewFx.quote && !reviewFx.quote.stale && reviewFx.quote.expiresAt > Date.now() ? 'Est. ' + formatPocketPaymentAmount(Number(direct.amount) / reviewFx.quote.rate) + ' USDC' : undefined} amount={pocketFiatCurrency(bank.country) + ' ' + Number(direct.amount || 0).toLocaleString('en', {maximumFractionDigits:2})} rows={[
          ['Bank', bank.bankName], ['Account name', bank.accountName], ['Account number', bank.accountNumber], ['Amount to receive', pocketFiatCurrency(bank.country) + ' ' + Number(direct.amount || 0).toLocaleString('en', {maximumFractionDigits:2})], ['Paying from', 'Base USDC'], ...(direct.memo ? [['Note', direct.memo] as [string,string]] : []),
        ]} />
<PocketSlideAction onApprovalBusyChange={setApprovalBusy}
                  status={directSlideStatus}
                  disabled={!direct.canSubmit}
                  onPrepare={direct.prepareApproval}
                  onConfirm={() => void direct.submit()}
                  labels={{
                    idle: direct.error ? 'Try again' : 'Confirm payout',
                    disabled: 'Complete payout details',
                    pending: direct.status === 'routing' && bankLiquidity.status === 'moving' ? 'Moving USDC' : 'Confirming payment',
                    submitted: direct.status === 'route-review' ? 'USDC move confirming' : direct.status === 'routing' ? 'USDC moving to Base' : 'Payment processing',
                    successful: 'Sent',
                  }}
                />

        {direct.error && <p role="alert" className="mt-3 text-center text-xs text-red-500">{direct.error}</p>}
        {bankLiquidity.notice && directLocked && ['moving', 'waiting', 'reconciling'].includes(bankLiquidity.status) && <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">{bankLiquidity.notice}</p>}
      </PocketBottomSheet>}
      {mode === 'withdraw' && bankReceipt && (
        <PocketPaymentSuccess
          receipt={bankReceipt}
          outcome={direct.status === 'sent' ? direct.result?.state === 'sent' ? 'completed' : 'handed-off' : 'pending'}
          onDone={() => {
            direct.resetResult(false)
            direct.setAmount('')
            setReviewOpen(false)
          }}
        />
      )}
    </PocketRouteShell>
  )
}
