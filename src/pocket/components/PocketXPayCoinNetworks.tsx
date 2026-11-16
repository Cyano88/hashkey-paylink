import PocketSavingIndicator from './PocketSavingIndicator'
import {useRef,useState} from 'react'
import PocketNetworkMark from './PocketNetworkMark'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import {xpayCoinNetworks,xpayCoinExecutable,XPAY_NETWORK_NAMES,type XPayCoin} from '../lib/xpayStablecoinOptions'
import type {PocketNetwork} from '../lib/pocketSchemas'
import type {XPayCheckout} from '../lib/pocketUnifiedXPay'
export default function PocketXPayCoinNetworks({coin,checkout,hostedNetworks,onSave,draft,onDraftChange}:{draft?:string[];onDraftChange:(networks:string[])=>void;coin:XPayCoin;checkout:XPayCheckout;hostedNetworks:string[];onSave:(networks:string[])=>Promise<void>}){
 const identity=usePocketIdentity(),wallets=usePocketWallets(identity)
 const [selected,setSelected]=useState(()=>draft||[...new Set(checkout.acceptance?checkout.acceptance.routes.filter(r=>r.asset===coin&&checkout.destinations.some(d=>d.id===r.destinationId&&d.kind==='stablecoins')).map(r=>r.network):checkout.destinations.filter(d=>d.kind==='stablecoins'&&d.assets.includes(coin)).flatMap(d=>d.networks||[]))])
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
 return <div className="flex min-h-0 flex-1 flex-col gap-4"><fieldset aria-label="Receiving networks" className="min-h-0 flex-1 divide-y divide-gray-100 overflow-y-auto dark:divide-white/10">{xpayCoinNetworks(coin).map(network=>{
  const hosted=coin!=='USDC'||network==='xlayer'||network==='bsc',supported=hosted?hostedNetworks.includes(network):xpayCoinExecutable(coin,network),ready=network==='xlayer'||network==='bsc'||!!wallets.wallets[network as PocketNetwork]?.address
  return <label key={network} className="flex min-h-16 items-center gap-3 py-3"><PocketNetworkMark network={network}/><span className="flex-1 text-sm font-medium">{XPAY_NETWORK_NAMES[network]}</span>{!supported?<span className="text-xs text-gray-500">Coming soon</span>:!ready?<span className="text-xs text-gray-500">Open wallet first</span>:null}<input type="checkbox" aria-label={'Receive '+coin+' on '+XPAY_NETWORK_NAMES[network]} className="h-4 w-4 accent-black dark:accent-white" checked={selected.includes(network)} disabled={busy||!supported||!ready} onChange={e=>{setError('');const next=e.target.checked?[...selected,network]:selected.filter(n=>n!==network);setSelected(next);onDraftChange(next)}}/></label>
 })}</fieldset><div className="shrink-0 space-y-3">{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}<button className="pocket-cta-primary w-full" disabled={busy} onClick={async()=>{if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await onSave(selected)}catch(e){if((e as {code?:string}).code!=='POCKET_APPROVAL_CANCELLED')setError(e instanceof Error?e.message:'Could not save receiving networks.')}finally{lock.current=false;setBusy(false)}}}>{busy?<PocketSavingIndicator label="Saving receiving networks"/>:'Save changes'}</button></div></div>
}
