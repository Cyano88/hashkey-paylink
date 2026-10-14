import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketEsimCheckout from './PocketEsimCheckout'
import { PocketSkeletonBar } from './PocketContentSkeletons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { pocketEsimRequest } from '../api/pocketEsimClient'
import type { PocketEsimCatalog, PocketEsimOrder } from '../lib/pocketEsim'
import { pocketEsimStatus } from '../lib/pocketEsimStatus'
import { canOpenEsimSettings, esimAlreadyInstalled, esimDevicePlatform, installEsim, openEsimSettings, type EsimInstallation } from '../lib/pocketEsimInstallation'

export default function PocketMyEsims({ catalog, initialOrderId, onClose }: { catalog: PocketEsimCatalog | null; initialOrderId?: string; onClose(): void }) {
  const { getAccessToken, email } = usePocketIdentity()
  const access = useRef(getAccessToken); access.current = getAccessToken
  const [orders, setOrders] = useState<PocketEsimOrder[] | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<PocketEsimOrder | null>(null)
  const [installation, setInstallation] = useState<EsimInstallation | null>(null), [copy, setCopy] = useState(false)
  const [opening, setOpening] = useState(false), [apnCopied, setApnCopied] = useState(false)
  const [installationRetry, setInstallationRetry] = useState(0)
  useEffect(() => {
    let disposed = false
    void pocketEsimRequest(access.current).then(data => { if (!disposed) { setOrders(data.orders); setError(''); if (initialOrderId && retry === 0) setSelected(data.orders.find((item: PocketEsimOrder) => item.id === initialOrderId) || null) } }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [email, retry, initialOrderId])
  useEffect(() => {
    setInstallation(null); setCopy(false); setApnCopied(false); setError('')
    if (selected?.state !== 'ready') return
    let disposed = false
    void pocketEsimRequest(access.current, { action: 'installation', id: selected.id }).then(data => { if (!disposed) setInstallation(data.installation) }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [selected?.id, installationRetry])
  const title = (item: PocketEsimOrder) => { if (item.packageLabel) return item.packageLabel; const destination = catalog?.destinations.find(d => d.plans.some(p => p.id === item.packageCode)); const plan = destination?.plans.find(p => p.id === item.packageCode); return plan ? `${plan.data} Â· ${destination!.name}` : 'eSIM' }
  if (selected && selected.state !== 'ready') return <PocketEsimCheckout existing={selected} onClose={() => { setSelected(null); setRetry(value => value + 1) }} />
  if (selected) return <PocketBottomSheet title="Your eSIM" onClose={() => setSelected(null)}>
    <h2 className="mb-5 text-lg font-semibold">{title(selected)}</h2>
    {installation ? <>
      {esimAlreadyInstalled(installation) ? <p className="mb-5 text-sm text-gray-500">eSIM installed</p> : esimDevicePlatform() !== 'web' && <>
        <button type="button" disabled={opening} className="pocket-cta-primary w-full" onClick={() => {
          setOpening(true); setError('')
          void installEsim(installation.activationCode).catch(() => setError('Could not open setup. Use other installation options below.')).finally(() => setOpening(false))
        }}>{opening ? 'Opening setup' : 'Install eSIM'}</button>
        <p className="mt-3 text-sm text-gray-500">Approve installation on your phone, then select this eSIM for mobile data and turn on roaming.</p>
      </>}
      <details className="my-5 text-sm" open={esimAlreadyInstalled(installation)}>
        <summary className="cursor-pointer font-medium">Internet setup</summary>
        <p className="mt-3 text-gray-500">Select this eSIM for mobile data and turn on roaming.</p>
        {installation.apn ? <>
          <p className="mt-3 text-gray-500">If you have signal but no internet, open this eSIM’s Access point names in phone settings. Add the details below, save, and select Pocket.</p>
          <dl className="my-4 space-y-2"><div className="flex justify-between gap-4"><dt className="text-gray-500">Name</dt><dd>Pocket</dd></div><div className="flex justify-between gap-4"><dt className="text-gray-500">APN</dt><dd className="break-all">{installation.apn}</dd></div></dl>
          <button type="button" className="py-2 text-sm font-medium" onClick={() => { void navigator.clipboard.writeText(installation.apn!).then(() => setApnCopied(true)).catch(() => setError('Could not copy. Use the internet setting shown above.')) }}>{apnCopied ? 'Copied' : 'Copy internet setting'}</button>
        </> : <p className="mt-3 text-gray-500">If internet still does not connect, contact Pocket support from your profile.</p>}
        {canOpenEsimSettings() && <button type="button" className="pocket-cta-primary mt-4 w-full" onClick={() => { void openEsimSettings().catch(() => setError('Open mobile network settings on your phone.')) }}>Open phone settings</button>}
      </details>
      <details className="my-5 text-sm" open={esimDevicePlatform() === 'web'}><summary className="cursor-pointer font-medium">Other installation options</summary>
      <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={installation.activationCode} size={200} /></div>
      <p className="my-4 text-center text-sm text-gray-500">Scan this code from another screen using your phone’s eSIM setup.</p>
      <details className="my-5 text-sm"><summary className="cursor-pointer font-medium">Manual installation</summary><dl className="mt-4 space-y-3 break-all"><dt className="text-gray-500">SM-DP+ address</dt><dd>{installation.activationCode.split('$')[1]}</dd><dt className="text-gray-500">Activation code</dt><dd>{installation.activationCode.split('$').slice(2).join('$')}</dd><dt className="text-gray-500">ICCID</dt><dd>{installation.iccid}</dd></dl></details>
      <button type="button" className="py-2 text-sm font-medium" onClick={() => { void navigator.clipboard.writeText(installation.activationCode).then(() => setCopy(true)).catch(() => setError('Could not copy. Open manual installation.')) }}>{copy ? 'Copied' : 'Copy activation code'}</button>
      </details>
    </> : !error ? <PocketSkeletonBar className="mx-auto h-52 w-52 rounded-2xl" /> : <button type="button" className="pocket-cta-primary w-full" onClick={() => setInstallationRetry(value => value + 1)}>Try again</button>}
    {error && <p role="status" className="mt-4 text-sm text-gray-500">{error}</p>}
  </PocketBottomSheet>
  return <PocketBottomSheet title="My eSIMs" onClose={onClose}>
    {!orders && !error ? <div className="space-y-4"><PocketSkeletonBar className="h-16 w-full" /><PocketSkeletonBar className="h-16 w-full" /></div> : orders?.length ? <div className="divide-y divide-gray-100 dark:divide-[#262626]">{orders.map(item => <button key={item.id} className="flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left" onClick={() => { setError(''); setSelected(item) }}><span><span className="block text-sm font-semibold">{title(item)}</span><span className="mt-1 block text-xs text-gray-500">{pocketEsimStatus(item.state).label}</span></span><span className="whitespace-nowrap text-sm">{Number(item.state === 'refunded' ? item.price.total : (item.totalDebit || item.price.total)).toFixed(2)} {item.asset}</span></button>)}</div> : !error && <p className="py-8 text-center text-sm text-gray-500">Your eSIMs will appear here.</p>}
    {error && <><p role="status" className="my-4 text-sm text-gray-500">{error}</p><button className="pocket-cta-primary w-full" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
  </PocketBottomSheet>
}
