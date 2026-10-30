import PocketReceivingWallet from './PocketReceivingWallet'
import { xlayerCheckoutAssets, type XLayerCheckoutConfig } from '../lib/xlayerCheckoutConfig'

export default function XLayerCheckoutSettings({ value, onChange, defaultRecipient, business = false }: { defaultRecipient?: string; business?: boolean; value?: XLayerCheckoutConfig; onChange: (value?: XLayerCheckoutConfig) => void }) {
  return <section className="mt-6 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { recipient: '', assets: [xlayerCheckoutAssets[0].address.toLowerCase()] } : undefined)} />Accept stablecoins on X Layer</label>
    <p className="text-sm leading-6 text-gray-500">Choose what customers can pay into your X Layer wallet. Available after activation.</p>
    {value && <div className="flex flex-wrap gap-2">{xlayerCheckoutAssets.map(asset=>{const address=asset.address.toLowerCase(),selected=value.assets.includes(address);return <label key={address} className="flex min-h-11 items-center gap-2 rounded-xl border border-gray-200 px-3 text-sm dark:border-white/10"><input type="checkbox" checked={selected} onChange={()=>onChange({...value,assets:selected?value.assets.filter(a=>a!==address):[...value.assets,address]})}/>{asset.symbol}</label>})}</div>}
    {value && <label className="block text-sm">Receiving address<input aria-label="X Layer checkout receiving address" value={value.recipient} onChange={e => onChange({ ...value, recipient: e.target.value })} placeholder="0x..." className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10" /></label>}
    {value&&<PocketReceivingWallet network="xlayer" address={defaultRecipient} selected={value.recipient} business={business} onSelect={()=>defaultRecipient&&onChange({...value,recipient:defaultRecipient})}/>}
  </section>
}
