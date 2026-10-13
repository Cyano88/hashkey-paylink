import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketEsimCheckout from './PocketEsimCheckout'
import { PocketSkeletonBar } from './PocketContentSkeletons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { pocketEsimRequest } from '../api/pocketEsimClient'
import type { PocketEsimCatalog, PocketEsimOrder } from '../lib/pocketEsim'
import { pocketEsimStatus } from '../lib/pocketEsimStatus'

export default function PocketMyEsims({ catalog, initialOrderId, onClose }: { catalog: PocketEsimCatalog | null; initialOrderId?: string; onClose(): void }) {
  const { getAccessToken, email } = usePocketIdentity()
  const access = useRef(getAccessToken); access.current = getAccessToken
  const [orders, setOrders] = useState<PocketEsimOrder[] | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<PocketEsimOrder | null>(null)
  const [installation, setInstallation] = useState<{ iccid: string; activationCode: string } | null>(null), [copy, setCopy] = useState(false)
  const [installationRetry, setInstallationRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    void pocketEsimRequest(access.current).then(data => { if (!disposed) { setOrders(data.orders); setError(''); if (initialOrderId && retry === 0) setSelected(data.orders.find((item: PocketEsimOrder) => item.id === initialOrderId) || null) } }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [email, retry, initialOrderId])
  useEffect(() => {
    setInstallation(null); setCopy(false); setError('')
    if (selected?.state !== 'ready') return
    let disposed = false
    void pocketEsimRequest(access.current, { action: 'installation', id: selected.id }).then(data => { if (!disposed) setInstallation(data.installation) }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [selected?.id, installationRetry])
  const title = (item: PocketEsimOrder) => { if (item.packageLabel) return item.packageLabel; const destination = catalog?.destinations.find(d => d.plans.some(p => p.id === item.packageCode)); const plan = destination?.plans.find(p => p.id === item.packageCode); return plan ? `${plan.data} Â· ${destination!.name}` : 'eSIM' }
  if (selected && selected.state !== 'ready') return <PocketEsimCheckout existing={selected} onClose={() => { setSelected(null); setRetry(value => value + 1) }} />
  if (selected) return <PocketBottomSheet title="Install eSIM" onClose={() => setSelected(null)}>
    <h2 className="mb-5 text-lg font-semibold">{title(selected)}</h2>
    {installation ? <>
      <div className="mx-auto w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={installation.activationCode} size={200} /></div>
      <p className="my-4 text-center text-sm text-gray-500">Add an eSIM in your phone settings, then scan this code from another screen.</p>
      <details className="my-5 text-sm"><summary className="cursor-pointer font-medium">Manual installation</summary><dl className="mt-4 space-y-3 break-all"><dt className="text-gray-500">SM-DP+ address</dt><dd>{installation.activationCode.split('$')[1]}</dd><dt className="text-gray-500">Activation code</dt><dd>{installation.activationCode.split('$').slice(2).join('$')}</dd><dt className="text-gray-500">ICCID</dt><dd>{installation.iccid}</dd></dl></details>
      <button type="button" className="pocket-cta-primary w-full" onClick={() => { void navigator.clipboard.writeText(installation.activationCode).then(() => setCopy(true)).catch(() => setError('Could not copy. Open manual installation.')) }}>{copy ? 'Copied' : 'Copy activation code'}</button>
    </> : !error ? <PocketSkeletonBar className="mx-auto h-52 w-52 rounded-2xl" /> : <button type="button" className="pocket-cta-primary w-full" onClick={() => setInstallationRetry(value => value + 1)}>Try again</button>}
    {error && <p role="status" className="mt-4 text-sm text-gray-500">{error}</p>}
  </PocketBottomSheet>
  return <PocketBottomSheet title="My eSIMs" onClose={onClose}>
    {!orders && !error ? <div className="space-y-4"><PocketSkeletonBar className="h-16 w-full" /><PocketSkeletonBar className="h-16 w-full" /></div> : orders?.length ? <div className="divide-y divide-gray-100 dark:divide-[#262626]">{orders.map(item => <button key={item.id} className="flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left" onClick={() => { setError(''); setSelected(item) }}><span><span className="block text-sm font-semibold">{title(item)}</span><span className="mt-1 block text-xs text-gray-500">{pocketEsimStatus(item.state).label}</span></span><span className="whitespace-nowrap text-sm">{Number(item.state === 'refunded' ? item.price.total : (item.totalDebit || item.price.total)).toFixed(2)} {item.asset}</span></button>)}</div> : !error && <p className="py-8 text-center text-sm text-gray-500">Your eSIMs will appear here.</p>}
    {error && <><p role="status" className="my-4 text-sm text-gray-500">{error}</p><button className="pocket-cta-primary w-full" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
  </PocketBottomSheet>
}
