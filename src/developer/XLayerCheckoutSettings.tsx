import { useState } from 'react'
import { xlayerCheckoutAssets, type XLayerCheckoutConfig } from '../lib/xlayerCheckoutConfig'

export default function XLayerCheckoutSettings({ value, onChange }: { value?: XLayerCheckoutConfig; onChange: (value?: XLayerCheckoutConfig) => void }) {
  const [search, setSearch] = useState('')
  return <section className="mt-6 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { recipient: '', assets: [] } : undefined)} />Accept assets on X Layer</label>
    <p className="text-sm leading-6 text-gray-500">Choose the assets your business accepts directly. Swap has its own permission. X Layer checkout requires release activation.</p>
    {value && <>
      <label className="block text-sm">Receiving address<input aria-label="X Layer checkout receiving address" value={value.recipient} onChange={e => onChange({ ...value, recipient: e.target.value })} placeholder="0x..." className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10" /></label>
      <input aria-label="Find accepted asset" placeholder="Search assets" value={search} onChange={e => setSearch(e.target.value)} className="min-h-11 w-full rounded-xl bg-gray-100 px-3 text-sm dark:bg-white/5" />
      <div className="max-h-60 overflow-y-auto">{xlayerCheckoutAssets.filter(asset => asset.symbol.toLowerCase().includes(search.toLowerCase())).map(asset => {
        const address = asset.address.toLowerCase(), selected = value.assets.includes(address)
        return <label key={address} className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={selected} disabled={!selected && value.assets.length >= 20} onChange={() => onChange({ ...value, assets: selected ? value.assets.filter(a => a !== address) : [...value.assets, address] })} />{asset.symbol}</label>
      })}</div>
      <p className="text-xs text-gray-500">{value.assets.length} of 20 assets selected. Stocks are not available for account funding or automatic bank settlement.</p>
    </>}
  </section>
}
