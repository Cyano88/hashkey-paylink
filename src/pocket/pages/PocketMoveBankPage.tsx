import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, ChevronDown, Landmark, Mail, Send } from 'lucide-react'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { formatNgnAmount } from '../../lib/utils'
import { LocalCurrencyProfileCard } from '../components/LocalCurrencyProfileCard'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketSlideAction from '../components/PocketSlideAction'
import usePocketBankReceiveController from '../controllers/usePocketBankReceiveController'
import usePocketBankWithdrawController from '../controllers/usePocketBankWithdrawController'
import usePocketWalletController from '../controllers/usePocketWalletController'
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
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

export default function PocketMoveBankPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const wallets = usePocketWallets({ authenticated, email, getAccessToken })
  const [mode, setMode] = useState<'idle' | 'request' | 'withdraw'>('idle')
  const bank = usePocketBankReceiveController({
    authenticated,
    email,
    getAccessToken,
    profile: profile.profile,
    profileDraft: profile.draft,
  })
  const onWalletReady = useCallback((network: 'base' | 'arbitrum' | 'arc' | 'solana', wallet: { address: string; walletId?: string; blockchain?: string; updatedAt?: number }) => {
    wallets.setWallets(current => ({ ...current, [network]: wallet }))
  }, [wallets.setWallets])
  const walletController = usePocketWalletController({ authenticated, email, getAccessToken, onWalletReady })
  const ensureBaseWallet = useCallback(async () => walletController.ensureWallet('base'), [walletController])
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
    getEvmSession: walletAddress => walletController.getEvmSession('base', walletAddress),
    getAccessToken,
    onSent: wallets.refreshBalances,
  })
  const directAmountDirty = direct.amount.length > 0
  const directAmountValid = /^\d+(?:\.\d{1,2})?$/.test(direct.amount) && Number(direct.amount) > 0
  const directSlideStatus = direct.status === 'sent'
    ? 'successful'
    : direct.status === 'processing'
      ? 'submitted'
      : direct.status === 'preparing' || direct.status === 'authorizing'
        ? 'pending'
        : 'idle'

  useEffect(() => {
    if (selectedNet !== 'base') onNetworkSelect('base')
  }, [onNetworkSelect, selectedNet])

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
      <div className="space-y-3.5">
        <div className="grid grid-cols-1 gap-2">
          {([
            { key: 'request', label: 'Payment Request', icon: Landmark, body: 'Create a link for someone to pay you.' },
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
        </div>

        {mode !== 'idle' && <div className="space-y-3.5 rounded-[24px] border border-gray-200/80 bg-white p-4 shadow-[0_12px_34px_rgba(15,23,42,0.07)] dark:border-white/10 dark:bg-white/[0.035] dark:shadow-[0_16px_40px_rgba(0,0,0,0.22)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">{mode === 'request' ? 'Payment request' : 'Direct bank payout'}</p>

          {!authenticated && (
            <div className="overflow-hidden rounded-[22px] bg-[#F5F5F7]/95 p-2 dark:bg-[#151518]/95">
              <PrivyConnectButton
                debugLabel="create-receive-bank"
                loginOptions={{ loginMethods: ['email'] }}
                logoutOnAuthenticated={false}
                className="group relative flex min-h-14 w-full items-center justify-center rounded-full bg-gray-950 px-16 py-1.5 text-center text-sm font-semibold text-white shadow-sm transition-all hover:bg-black active:scale-[0.98] disabled:opacity-60 dark:bg-white/[0.12] dark:text-white dark:hover:bg-white/[0.16]"
              >
                <Mail className="absolute left-5 h-4 w-4" />
                <span>Sign in to Bank</span>
                <span className="absolute right-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 transition-transform group-hover:translate-x-0.5">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </PrivyConnectButton>
              <p className="px-3 pb-1 pt-2 text-center text-[11px] font-medium text-gray-400 dark:text-gray-500">
                Secure access keeps bank payouts, settlement history, receipts, and support records connected.
              </p>
            </div>
          )}

          {authenticated && <>
            <LocalCurrencyProfileCard
              profile={profile.profile}
              draft={profile.draft}
              email={email}
              busy={profile.busy}
              error={profile.error}
              editing={profile.editing}
              bankAccountName={bank.accountName}
              onDraftChange={profile.setDraft}
              onSave={() => void profile.save()}
              onEdit={profile.edit}
              onCancel={profile.cancel}
              embedded
            />

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
              onVerify={() => void bank.verify()}
              embedded
            />

            {mode === 'request' && <>
              <PocketPaymentAmountField
                lane="bank"
                flexible={bank.flexibleAmount}
                amount={bank.amount}
                dirty={bank.amountDirty}
                valid={bank.amountValid}
                helperText="Enter the Naira amount the payer should pay."
                onAmountChange={bank.setAmount}
              />

              <div className="border-y border-gray-100 py-3 dark:border-white/[0.07]">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payer network</p>
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Bank receive supports Base USDC only for now.</p>
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
                    <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Direct bank payouts currently use your Base USDC wallet.</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950">
                    Base
                  </span>
                </div>
              </div>

              <PocketPaymentNoteField value={direct.memo} onChange={direct.setMemo} />

              <div className="space-y-2 pt-1">
                <PocketSlideAction
                  status={directSlideStatus}
                  disabled={!direct.canSubmit}
                  onConfirm={() => void direct.submit()}
                  labels={{
                    idle: 'Slide to confirm',
                    disabled: 'Complete payout details',
                    pending: direct.status === 'authorizing' ? 'Confirm in Circle' : 'Preparing payout',
                    submitted: 'Payment processing',
                    successful: 'Sent',
                  }}
                />
                {direct.status === 'authorizing' && <p className="px-2 text-center text-xs font-medium text-blue-600 dark:text-blue-400">Approve the Circle confirmation to continue.</p>}
                {direct.status === 'processing' && <p className="px-2 text-center text-xs text-gray-500 dark:text-gray-400">USDC is confirmed. Your bank payout is processing.</p>}
                {direct.status === 'sent' && <p className="px-2 text-center text-xs font-medium text-emerald-600 dark:text-emerald-400">Sent to {direct.result?.bankName || bank.bankName}{direct.result?.bankLast4 ? ` ••••${direct.result.bankLast4}` : ''}. It is now in Activity.</p>}
                {direct.error && <p className="px-2 text-center text-xs font-medium text-red-500">{direct.error}</p>}
                {!direct.canSubmit && direct.status === 'idle' && !direct.error && <p className="px-2 text-center text-xs text-gray-400 dark:text-gray-500">Save your profile, verify the bank account, and enter a Naira amount.</p>}
              </div>
            </>}
          </>}
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
    </PocketRouteShell>
  )
}
