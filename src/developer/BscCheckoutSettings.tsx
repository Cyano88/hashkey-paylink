import PocketReceivingWallet from './PocketReceivingWallet'
import { bscCheckoutAssets, type BscCheckoutConfig } from '../lib/bscCheckoutConfig'

export default function BscCheckoutSettings({ value, onChange, defaultRecipient, business = false }: { defaultRecipient?: string; business?: boolean; value?: BscCheckoutConfig; onChange: (value?: BscCheckoutConfig) => void }) {
  return <section className="mt-6 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { recipient: '', assets: [bscCheckoutAssets[0].address.toLowerCase()] } : undefined)} />Accept stablecoins on BNB Chain</label>
    <p className="text-sm leading-6 text-gray-500">Choose what customers can pay into your BNB Chain wallet. Available after activation.</p>
    {value && <div className="flex flex-wrap gap-2">{bscCheckoutAssets.map(asset=>{const address=asset.address.toLowerCase(),selected=value.assets.includes(address);return <label key={address} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm dark:border-white/10"><input type="checkbox" checked={selected} disabled={selected&&value.assets.length===1} onChange={()=>onChange({...value,assets:selected?value.assets.filter(a=>a!==address):[...value.assets,address]})}/>{asset.symbol}</label>})}</div>}
    {value && <label className="block text-sm">Receiving address<input aria-label="BNB Chain checkout receiving address" value={value.recipient} onChange={e => onChange({ ...value, recipient: e.target.value })} placeholder="0x..." className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10" /></label>}
    {value&&<PocketReceivingWallet network="bsc" address={defaultRecipient} selected={value.recipient} business={business} onSelect={()=>defaultRecipient&&onChange({...value,recipient:defaultRecipient})}/>}
  </section>
}
