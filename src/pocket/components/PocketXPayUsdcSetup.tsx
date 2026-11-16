import PocketSavingIndicator from './PocketSavingIndicator'
import {xpayCoinNetworks,xpayCoinExecutable,XPAY_NETWORK_NAMES} from '../lib/xpayStablecoinOptions'
import type {PocketNetwork} from '../lib/pocketSchemas'
import {useState} from 'react'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import PocketNetworkMark from './PocketNetworkMark'

export default function PocketXPayUsdcSetup({initialNetworks=[],onSave}:{initialNetworks?:string[];onSave:(networks:string[])=>Promise<void>}){
 const identity=usePocketIdentity(),wallets=usePocketWallets(identity)
 const [selected,setSelected]=useState(initialNetworks),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <div className="flex min-h-0 flex-1 flex-col gap-4"><div className="min-h-0 flex-1 overflow-y-auto"><p className="text-sm text-gray-500">Choose where to receive USDC.</p>
  {xpayCoinNetworks('USDC').map(network=><label key={network} className="flex min-h-14 items-center gap-3"><PocketNetworkMark network={network}/><span className="flex-1">{XPAY_NETWORK_NAMES[network]}</span>{!xpayCoinExecutable('USDC',network)?<span className="text-xs text-gray-500">Coming soon</span>:!wallets.wallets[network as PocketNetwork]?.address&&<span className="text-xs text-gray-500">Open wallet first</span>}<input type="checkbox" aria-label={'Receive USDC on '+network} disabled={busy||!xpayCoinExecutable('USDC',network)||!wallets.wallets[network as PocketNetwork]?.address} checked={selected.includes(network)} onChange={e=>setSelected(old=>e.target.checked?[...old,network]:old.filter(n=>n!==network))}/></label>)}
  </div><div className="shrink-0 space-y-3">{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}<button className="pocket-cta-primary w-full" disabled={busy||!selected.length} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await onSave(selected)}catch(e){if((e as {code?:string})?.code!=='POCKET_APPROVAL_CANCELLED')setError(e instanceof Error?e.message:'Could not save receiving networks.')}finally{setBusy(false)}}}>{busy?<PocketSavingIndicator label="Saving receiving networks"/>:'Continue'}</button>
  </div>
 </div>
}
