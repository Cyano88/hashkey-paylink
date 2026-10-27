import { xlayerCheckoutAssets, type XLayerCheckoutConfig } from '../lib/xlayerCheckoutConfig'

export default function XLayerCheckoutSettings({ value, onChange }: { value?: XLayerCheckoutConfig; onChange: (value?: XLayerCheckoutConfig) => void }) {
  return <section className="mt-6 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/10">
    <label className="flex items-center gap-3 text-sm font-semibold"><input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked ? { recipient: '', assets: [xlayerCheckoutAssets[0].address.toLowerCase()] } : undefined)} />Accept USDC on X Layer</label>
    <p className="text-sm leading-6 text-gray-500">Receive USDC directly in your X Layer wallet. Available after activation.</p>
    {value && <label className="block text-sm">Receiving address<input aria-label="X Layer checkout receiving address" value={value.recipient} onChange={e => onChange({ ...value, recipient: e.target.value })} placeholder="0x..." className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10" /></label>}
  </section>
}
