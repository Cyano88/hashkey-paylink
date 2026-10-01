import { useState } from 'react'
import PocketFlowHeader from '../../components/PocketFlowHeader'
import { PocketPayerNetworkPanel } from '../move/PocketPayerNetworkPanel'
import { GIFT_NETWORKS, validateGiftDraft, type GiftDraft, type GiftNetwork } from './pocketGift'
export default function PocketGiftCreate({ onContinue, onBack, networks = GIFT_NETWORKS }: { networks?: readonly GiftNetwork[]; onContinue: (draft: GiftDraft) => void; onBack: () => void }) {
  const [amount, setAmount] = useState(''), [network, setNetwork] = useState<GiftNetwork>(networks[0] || 'base'), [message, setMessage] = useState(''), [error, setError] = useState('')
  let canContinue = false
  try { validateGiftDraft({amount,network,message:message.trim(),claims:1}); canContinue = true } catch { /* Keep Continue disabled until the draft is valid. */ }
  return <main data-pocket-colour-scope="stablecoins" className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-[max(1.5rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))] text-gray-950 dark:text-white">
    <PocketFlowHeader title="Send a gift" centered onBack={onBack} />
    <form className="mt-7 flex flex-1 flex-col gap-6" onSubmit={event => { event.preventDefault(); const draft = { amount, network, message: message.trim(), claims: 1 }; try { validateGiftDraft(draft); setError(''); onContinue(draft) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check your gift details.') } }}>
      <PocketPayerNetworkPanel showSelector selectedNetwork={network} selectedNetworkLabel={network[0].toUpperCase() + network.slice(1)} options={networks.map(value => ({ value, label: value[0].toUpperCase() + value.slice(1) }))} multiChain={false} emailReceive={false} onNetworkSelect={value => setNetwork(value as GiftNetwork)} onMultiChainToggle={() => {}} showMultiChainToggle={false} />
      <label className="block text-sm font-medium">Gift amount<span className="relative mt-2 block"><input aria-label="Gift amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => { setAmount(e.target.value); setError('') }} placeholder="0.00" className="h-14 w-full rounded-xl border border-gray-200 bg-white px-4 pr-20 text-xl font-semibold outline-none focus:border-gray-500 dark:border-[#262626] dark:bg-[#121212]" /><span className="absolute right-4 top-4 text-sm text-gray-500">USDC</span></span></label>
      <label className="block text-sm font-medium">Message <span className="font-normal text-gray-500">(optional)</span><textarea aria-label="Gift message" value={message} maxLength={160} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Something to make your day." className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-500 dark:border-[#262626] dark:bg-[#121212]" /></label>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-auto pt-4"><p className="mb-4 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">Anyone with your gift link can claim it.</p><button type="submit" disabled={!canContinue} className="pocket-cta-primary w-full disabled:cursor-not-allowed disabled:opacity-40">Continue</button></div>
    </form>
  </main>
}
