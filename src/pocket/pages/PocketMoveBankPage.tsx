import { useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { ArrowRight, Mail } from 'lucide-react'
import type { LayoutOutletContext } from '../../Layout'
import PayLinkShareSheet from '../../components/PayLinkShareSheet'
import { PrivyConnectButton } from '../../lib/PrivyConnectButton'
import { formatNgnAmount } from '../../lib/utils'
import { LocalCurrencyProfileCard } from '../components/LocalCurrencyProfileCard'
import type { PocketNavTab } from '../components/PocketBottomNav'
import PocketRouteShell from '../components/PocketRouteShell'
import usePocketBankReceiveController from '../controllers/usePocketBankReceiveController'
import {
  PocketFlexibleAmountToggle,
  PocketPaymentAmountField,
  PocketPaymentNoteField,
  PocketPayLinkSubmitPanel,
} from '../features/move/PocketPayLinkFields'
import { PocketPayLinkReadyPanel } from '../features/move/PocketPayLinkReadyPanel'
import { PocketReceiveMethodPanel } from '../features/move/PocketReceiveMethodPanel'
import { PocketVerifiedBankFields } from '../features/move/PocketVerifiedBankFields'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { pocketPathFor } from '../lib/pocketRoutes'

const POCKET_BASE_PATH = '/pocket'

export default function PocketMoveBankPage() {
  const navigate = useNavigate()
  const { selectedNet, onNetworkSelect } = useOutletContext<LayoutOutletContext>()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const bank = usePocketBankReceiveController({
    authenticated,
    email,
    getAccessToken,
    profile: profile.profile,
    profileDraft: profile.draft,
  })

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
        <PocketReceiveMethodPanel
          receiveMode="bank"
          canReceiveWithEmail={false}
          selectedNetwork="base"
          networkLabel="Base"
          recipientPending={false}
          recipientError={null}
          recipientAddressLabel=""
          walletBalance=""
          walletReady={false}
          hideLabel
          bankFields={(
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
            />
          )}
          onSelectPaste={() => {}}
          onSelectEmail={() => {}}
          onDisconnectEmail={() => {}}
        />

        {authenticated && (
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
          />
        )}

        <PocketPaymentAmountField
          lane="bank"
          flexible={bank.flexibleAmount}
          amount={bank.amount}
          dirty={bank.amountDirty}
          valid={bank.amountValid}
          helperText="Enter the Naira amount the payer should pay."
          onAmountChange={bank.setAmount}
        />

        <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.04]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Payer network</p>
              <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">Bank receive supports Base USDC only for now.</p>
            </div>
            <button
              type="button"
              className="inline-flex shrink-0 cursor-default items-center gap-1.5 rounded-xl border border-gray-900 bg-gray-950 px-3 py-2 text-xs font-bold text-white dark:border-white dark:bg-white dark:text-gray-950"
              aria-label="Selected payer network"
            >
              Base
            </button>
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

        {!authenticated && (
          <div className="overflow-hidden rounded-[26px] border border-gray-200 bg-[#F5F5F7]/95 p-2 shadow-[0_12px_36px_rgba(15,23,42,0.1)] dark:border-white/10 dark:bg-[#151518]/95 dark:shadow-[0_16px_44px_rgba(0,0,0,0.3)]">
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
      </div>

      {bank.generatedLink && (
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
