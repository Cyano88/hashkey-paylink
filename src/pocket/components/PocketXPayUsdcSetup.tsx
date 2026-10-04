import {useState} from 'react'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketWallets from '../hooks/usePocketWallets'
import PocketNetworkMark from './PocketNetworkMark'

export default function PocketXPayUsdcSetup({initialNetworks=[],onSave}:{initialNetworks?:string[];onSave:(networks:string[])=>Promise<void>}){
 const identity=usePocketIdentity(),wallets=usePocketWallets(identity)
 const [selected,setSelected]=useState(initialNetworks),[busy,setBusy]=useState(false),[error,setError]=useState('')
 return <div className="space-y-5"><p className="text-sm text-gray-500">Choose where to receive USDC.</p>
  {(['base','arbitrum','arc'] as const).map(network=><label key={network} className="flex min-h-14 items-center gap-3"><PocketNetworkMark network={network}/><span className="flex-1 capitalize">{network}</span>{!wallets.wallets[network]?.address&&<span className="text-xs text-gray-500">Open wallet first</span>}<input type="checkbox" aria-label={'Receive USDC on '+network} disabled={busy||!wallets.wallets[network]?.address} checked={selected.includes(network)} onChange={e=>setSelected(old=>e.target.checked?[...old,network]:old.filter(n=>n!==network))}/></label>)}
  <button className="pocket-cta-primary w-full" disabled={busy||!selected.length} onClick={async()=>{if(busy)return;setBusy(true);setError('');try{await onSave(selected)}catch(e){setError(e instanceof Error?e.message:'Could not save receiving networks.')}finally{setBusy(false)}}}>{busy?'Saving...':'Continue'}</button>
  {error&&<p role="alert" className="text-xs text-red-500">{error}</p>}
 </div>
}
