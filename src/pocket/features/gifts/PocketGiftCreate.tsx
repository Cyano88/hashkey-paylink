import PocketArcTokenPicker from '../../components/PocketArcTokenPicker'
import {stockPickerTokens} from '../../lib/pocketStockPickerTokens'
import {RectangleStackIcon} from '@heroicons/react/24/outline'
import { useState } from 'react'
import {multiGiftPlan,type MultiGiftAsset} from './pocketMultiGift'
import PocketFlowHeader from '../../components/PocketFlowHeader'
import { PocketPayerNetworkPanel } from '../move/PocketPayerNetworkPanel'
import { GIFT_NETWORKS, validateGiftDraft, type GiftDraft, type GiftNetwork } from './pocketGift'
export default function PocketGiftCreate({ onContinue, onBack, onYourGifts, networks = GIFT_NETWORKS, maxRecipients = 1, assets }: { assets?:readonly MultiGiftAsset[]; maxRecipients?:number; onYourGifts?:()=>void; networks?: readonly GiftNetwork[]; onContinue: (draft: GiftDraft) => void; onBack: () => void }) {
  const [selectedToken,setSelectedToken]=useState(assets?.[0]?.token||'')
  const selectedAsset=assets?.find(a=>a.token===selectedToken)
  const stockTokens=new Map((assets?stockPickerTokens():[]).map(t=>[t.address.toLowerCase(),t]))
  const pickerTokens=assets?assets.map(a=>{const token=stockTokens.get(a.token.toLowerCase());return {...token,address:a.token,symbol:a.symbol,name:token?.name||a.symbol,decimals:a.decimals,balance:null,balanceStatus:'unavailable'}}):[]
  const [recipients,setRecipients]=useState('1')
  const [amount, setAmount] = useState(''), [network, setNetwork] = useState<GiftNetwork>(networks[0] || 'base'), [message, setMessage] = useState(''), [error, setError] = useState('')
  const draftValue=()=>{const claims=Number(recipients);if(!Number.isSafeInteger(claims)||claims<1||claims>Math.min(1000,maxRecipients))throw Error('Choose a supported number of recipients.');if(assets&&!selectedAsset)throw Error('Choose a stock.');const plan=multiGiftPlan(amount,claims,selectedAsset||{chainId:8453,token:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',symbol:'USDC',decimals:6,rail:'stablecoins'});return {amount:plan.total,network:selectedAsset?'xlayer' as const:network,message:message.trim(),claims,...(selectedAsset?{asset:selectedAsset}:{})}}
  let canContinue = false
  try { validateGiftDraft(draftValue()); canContinue = true } catch { /* Keep Continue disabled until the draft is valid. */ }
  return <main data-pocket-gift-surface data-pocket-colour-scope={assets?'xstocks':'stablecoins'} className="mx-auto flex min-h-[100dvh] max-w-md flex-col px-5 pb-[max(1.5rem,var(--pocket-safe-bottom))] pt-[max(1rem,var(--pocket-safe-top))] text-gray-950 dark:text-white">
    <PocketFlowHeader title="Send a gift" centered onBack={onBack} rightAction={onYourGifts?<button type="button" aria-label="Your gifts" onClick={onYourGifts} className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 dark:border-[#262626]"><RectangleStackIcon className="h-5 w-5"/></button>:undefined} />
    <form className="mt-7 flex flex-1 flex-col gap-6" onSubmit={event => { event.preventDefault(); try { const draft=draftValue(); validateGiftDraft(draft); setError(''); onContinue(draft) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Check your gift details.') } }}>
      <PocketPayerNetworkPanel showSelector selectedNetwork={assets?'xlayer':network} selectedNetworkLabel={assets?'X Layer':network[0].toUpperCase()+network.slice(1)} options={networks.map(value=>({value,label:value==='xlayer'?'X Layer':value[0].toUpperCase()+value.slice(1)}))} multiChain={false} emailReceive={false} onNetworkSelect={value=>setNetwork(value as GiftNetwork)} onMultiChainToggle={()=>{}} showMultiChainToggle={false}/>
      {assets&&<div><p className="mb-2 text-sm font-medium">Stock</p><PocketArcTokenPicker label="Gift stock" value={selectedToken} excluded="" tokens={pickerTokens} networkLabel="X Layer" clean initialLimit={100} onChange={token=>{setSelectedToken(token.address);setError('')}} discover={async()=>{throw Error('Choose a supported gift stock.')}}/></div>}
      <label className="block text-sm font-medium">{maxRecipients>1?'Amount per recipient':'Gift amount'}<span className="relative mt-2 block"><input aria-label="Gift amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => { setAmount(e.target.value); setError('') }} placeholder="0.00" className="h-14 w-full rounded-xl border border-gray-200 bg-white px-4 pr-20 text-xl font-semibold outline-none focus:border-gray-500 dark:border-[#262626] dark:bg-[#121212]" /><span className="absolute right-4 top-4 text-sm text-gray-500">{selectedAsset?.symbol||'USDC'}</span></span></label>
      {maxRecipients>1&&<label className="block text-sm font-medium">Number of recipients<input aria-label="Number of recipients" type="number" min={1} max={Math.min(1000,maxRecipients)} step={1} value={recipients} onChange={e=>{setRecipients(e.target.value);setError('')}} className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-white px-4 dark:border-[#262626] dark:bg-[#121212]"/><span className="mt-2 block text-xs text-gray-500">{canContinue?draftValue().amount+' '+(selectedAsset?.symbol||'USDC')+' total before fees':'Each recipient gets the same amount.'}</span></label>}
      <label className="block text-sm font-medium">Message <span className="font-normal text-gray-500">(optional)</span><textarea aria-label="Gift message" value={message} maxLength={160} onChange={e => setMessage(e.target.value)} rows={3} placeholder="Something to make your day." className="mt-2 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none focus:border-gray-500 dark:border-[#262626] dark:bg-[#121212]" /></label>
      {error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      <div className="mt-auto pt-4"><p className="mb-4 text-center text-xs leading-5 text-gray-500 dark:text-gray-400">Anyone with your gift link can claim it.</p><button type="submit" disabled={!canContinue} className="pocket-cta-primary w-full disabled:cursor-not-allowed disabled:opacity-40">Continue</button></div>
    </form>
  </main>
}
