import {MoneyText,MoneyAmount} from '../../components/MoneyText'
﻿import { useEffect, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketEsimCheckout from './PocketEsimCheckout'
import PocketTransactionSheet from './PocketTransactionSheet'
import { PocketListSkeleton, PocketInlineRowsSkeleton, PocketSkeletonBar } from './PocketContentSkeletons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import { pocketEsimRequest } from '../api/pocketEsimClient'
import { pocketEsimAllowanceLabel, pocketEsimDisplayCurrency, pocketEsimPaymentLabel, type PocketEsimCatalog, type PocketEsimOrder, type PocketEsimTopUpDestination, type PocketEsimTopUpPlan } from '../lib/pocketEsim'
import { pocketEsimStatus } from '../lib/pocketEsimStatus'
import { ChevronRight } from './PocketIcons'
import PocketCountryFlag from './PocketCountryFlag'
import { canOpenEsimSettings, esimAlreadyInstalled, esimDevicePlatform, installEsim, openEsimSettings, type EsimInstallation } from '../lib/pocketEsimInstallation'

function remainingDataLabel(profile: EsimInstallation) {
  const total = Number(profile.totalVolume), used = Number(profile.usedVolume)
  if (!Number.isFinite(total) || !Number.isFinite(used) || total <= 0 || used < 0) return ''
  const left = Math.max(0, total - used), gb = left / (1024 ** 3)
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.floor(left / (1024 ** 2))} MB`
}

function expiryLabel(value?: string) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date) : ''
}

function coversCountry(item: PocketEsimOrder, catalog: PocketEsimCatalog | null, countryCode: string) {
  const destination = catalog?.destinations.find(entry => entry.plans.some(plan => plan.id === item.packageCode))
  if (!destination) return false
  if (destination.countryCode.toUpperCase() === countryCode) return true
  const plan = destination.plans.find(entry => entry.id === item.packageCode)
  let name = countryCode
  try { name = new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) || countryCode } catch { /* Keep the ISO code. */ }
  return Boolean(plan?.coverage?.some(value => value.trim().toLocaleLowerCase() === name.toLocaleLowerCase() || value.trim().toUpperCase() === countryCode))
}

function countryLabel(code: string) {
  try { return new Intl.DisplayNames(undefined, { type: 'region' }).of(code) || code } catch { return code }
}

export default function PocketMyEsims({ catalog, initialOrderId, arrivalCountryCode, onClose, onBrowsePlans }: { catalog: PocketEsimCatalog | null; initialOrderId?: string; arrivalCountryCode?: string; onClose(): void; onBrowsePlans(countryCode?: string): void }) {
  const { getAccessToken, email } = usePocketIdentity()
  const access = useRef(getAccessToken); access.current = getAccessToken
  const [orders, setOrders] = useState<PocketEsimOrder[] | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0)
  const [selected, setSelected] = useState<PocketEsimOrder | null>(null)
  const [installation, setInstallation] = useState<EsimInstallation | null>(null), [copy, setCopy] = useState(false)
  const [opening, setOpening] = useState(false), [apnCopied, setApnCopied] = useState(false)
  const [installationRetry, setInstallationRetry] = useState(0)
  const [topUpDestinations, setTopUpDestinations] = useState<PocketEsimTopUpDestination[] | null>(null), [topUpOpen, setTopUpOpen] = useState(false), [topUpRetry, setTopUpRetry] = useState(0), [topUpError, setTopUpError] = useState('')
  const [topUpPlan, setTopUpPlan] = useState<PocketEsimTopUpPlan | null>(null)
  useEffect(() => {
    let disposed = false
    void pocketEsimRequest(access.current).then(data => { if (!disposed) { setOrders(data.orders.filter((item: PocketEsimOrder) => !item.topUpFor)); setError(''); if (initialOrderId && retry === 0) setSelected(data.orders.find((item: PocketEsimOrder) => item.id === initialOrderId) || null) } }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [email, retry, initialOrderId])
  useEffect(() => {
    setInstallation(null); setCopy(false); setApnCopied(false); setError('')
    if (selected?.state !== 'ready') return
    let disposed = false
    void pocketEsimRequest(access.current, { action: 'installation', id: selected.id }).then(data => { if (!disposed) setInstallation(data.installation) }).catch(reason => { if (!disposed) setError(reason.message) })
    return () => { disposed = true }
  }, [selected?.id, installationRetry])
  useEffect(() => {
    setTopUpDestinations(null); setTopUpError('')
    if (!selected || selected.state !== 'ready' || !catalog?.purchaseEnabled) return
    let disposed = false
    void pocketEsimRequest(access.current, { action: 'topup-options', id: selected.id }).then(data => { if (!disposed) setTopUpDestinations(Array.isArray(data.destinations) ? data.destinations : []) }).catch(reason => { if (!disposed) { if (['ESIM_TOPUP_NOT_AVAILABLE', 'ESIM_PROFILE_UNAVAILABLE'].includes((reason as { code?: string })?.code || '')) setTopUpDestinations([]); else { setTopUpDestinations([]); setTopUpError('Could not check top-up plans.') } } })
    return () => { disposed = true }
  }, [selected?.id, selected?.state, catalog?.purchaseEnabled, installationRetry, topUpRetry])
  const title = (item: PocketEsimOrder) => { if (item.packageLabel) return item.packageLabel; const destination = catalog?.destinations.find(d => d.plans.some(p => p.id === item.packageCode)); const plan = destination?.plans.find(p => p.id === item.packageCode); return plan ? `${pocketEsimAllowanceLabel(plan)} - ${item.days} ${item.days === 1 ? 'day' : 'days'} - ${destination!.name}` : 'eSIM' }
  const expired = Boolean(installation && (['EXPIRED', 'UNUSED_EXPIRED', 'USED_EXPIRED'].includes((installation.status || '').toUpperCase()) || (installation.expiresAt && Date.parse(installation.expiresAt) < Date.now())))
  const dataRemaining = installation ? remainingDataLabel(installation) : ''
  const expires = installation ? expiryLabel(installation.expiresAt) : ''
  const depleted = Boolean(installation && ['USED_UP', 'USEDUP'].includes((installation.status || '').toUpperCase()))
  const arrivalName = arrivalCountryCode ? countryLabel(arrivalCountryCode) : ''
  const matchingArrivalOrder = arrivalCountryCode ? orders?.find(item => item.state === 'ready' && coversCountry(item, catalog, arrivalCountryCode)) : undefined
  if (selected?.topUpFor && selected.state === 'ready') { const displayCurrency = pocketEsimDisplayCurrency(selected.asset); return <PocketTransactionSheet title="eSIM top-up" state="successful" statusLabel="Data added" amount={`${displayCurrency} ${Number(selected.totalDebit || selected.price.total).toFixed(2)}`} detail="Your existing eSIM has been updated." onDone={() => { setSelected(null); setRetry(value => value + 1) }} detailsRows={[["Plan", selected.packageLabel || 'Travel data'], ['Paid with', pocketEsimPaymentLabel(selected.asset)], ['Fee', <MoneyAmount currency={displayCurrency} amount={(Number(selected.price.platformFee) + Number(selected.networkFee || 0)) < .01 ? '<0.01' : (Number(selected.price.platformFee) + Number(selected.networkFee || 0)).toFixed(2)} />], ['Total', <MoneyAmount currency={displayCurrency} amount={Number(selected.totalDebit || selected.price.total).toFixed(2)} />], ['Status', 'Data added']]} /> }
  if (selected && selected.state !== 'ready') return <PocketEsimCheckout existing={selected} topUpFor={selected.topUpFor} onClose={() => { setSelected(null); setRetry(value => value + 1) }} />
  if (topUpPlan && selected) return <PocketEsimCheckout plan={topUpPlan} days={topUpPlan.days} topUpFor={selected.id} onClose={() => { setTopUpPlan(null); setInstallationRetry(value => value + 1); setRetry(value => value + 1) }} />
  if (selected) return <PocketBottomSheet title={topUpOpen ? 'Add data' : 'Your eSIM'} onBack={topUpOpen ? () => setTopUpOpen(false) : undefined} onClose={() => { setTopUpOpen(false); setSelected(null) }}>
    {topUpOpen ? <>
      <p className="mb-4 text-sm text-gray-500">Plans are added to this eSIM. Data and validity depend on the plan. Fee and total are shown before payment.</p>
      {topUpDestinations?.map(destination => <section key={destination.id} className="mb-5" aria-label={destination.name}>
        <div className="mb-2 flex items-center gap-3"><PocketCountryFlag code={destination.region ? undefined : destination.countryCode} /><h3 className="text-sm font-semibold">{destination.name}</h3></div>
        <div className="divide-y divide-gray-100 dark:divide-[#262626]">{destination.plans.map(plan => <button type="button" key={plan.id} onClick={() => { setTopUpOpen(false); setTopUpPlan(plan) }} className="flex min-h-16 w-full items-center gap-3 py-3 text-left">
          <span className="flex-1"><span className="block text-sm font-medium">{pocketEsimAllowanceLabel(plan)}</span><span className="mt-1 block text-xs text-gray-500">Valid for {plan.days} {plan.days === 1 ? 'day' : 'days'}</span></span><MoneyAmount currency="USD" amount={Number(plan.price.subtotal).toFixed(2)} /><ChevronRight className="h-4 w-4 text-gray-400" />
        </button>)}</div>
      </section>)}
      {topUpDestinations === null && !topUpError && <PocketInlineRowsSkeleton label="Loading top-up plans" rows={3} />}
      {topUpError && <div><p role="status" className="text-sm text-gray-500">{topUpError}</p><button type="button" className="mt-2 text-sm font-medium" onClick={() => setTopUpRetry(value => value + 1)}>Try again</button></div>}
    </> : <>
    <h2 className="mb-5 text-lg font-semibold">{title(selected)}</h2>
    {arrivalCountryCode && catalog && <div role="status" className="mb-5 rounded-2xl bg-gray-100 p-4 text-sm leading-6 dark:bg-[#171717]">{coversCountry(selected, catalog, arrivalCountryCode) ? `This plan lists coverage in ${arrivalName}. Check the data left and valid-until date below.` : `This plan does not list coverage in ${arrivalName}. Choose a plan for that country before using mobile data.`}{!coversCountry(selected, catalog, arrivalCountryCode) && <button type="button" className="mt-2 block text-sm font-semibold" onClick={() => onBrowsePlans(arrivalCountryCode)}>Browse {arrivalName} plans</button>}</div>}
    {installation && (dataRemaining || expires) && <dl className="mb-5 space-y-3 text-sm">{dataRemaining && <div className="flex justify-between gap-4"><dt className="text-gray-500">Data left</dt><dd className="font-medium">{dataRemaining}</dd></div>}{expires && <div className="flex justify-between gap-4"><dt className="text-gray-500">Valid until</dt><dd className="font-medium">{expires}</dd></div>}</dl>}
    {installation && dataRemaining && <p className="mb-5 text-xs text-gray-500">Usage can take a few hours to update.</p>}
    {installation ? <>
      {expired ? <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">This plan has expired.</p> : depleted ? <p className="mb-3 text-sm text-gray-600 dark:text-gray-300">This plan has no data remaining.</p> : esimAlreadyInstalled(installation) ? <p className="mb-5 text-sm text-gray-500">eSIM installed</p> : esimDevicePlatform() !== 'web' && <>
        <button type="button" disabled={opening} className="pocket-cta-primary w-full" onClick={() => {
          setOpening(true); setError('')
          void installEsim(installation.activationCode).catch(() => setError('Could not open setup. Use other installation options below.')).finally(() => setOpening(false))
        }}>{opening ? 'Opening setup' : 'Install eSIM'}</button>
        <p className="mt-3 text-sm text-gray-500">Approve installation on your phone, then select this eSIM for mobile data and turn on roaming.</p>
      </>}
      <details className="group my-5 text-sm" open={esimAlreadyInstalled(installation)}>
        <summary className="flex list-none cursor-pointer items-center justify-between font-medium [&::-webkit-details-marker]:hidden"><span>Internet setup</span><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></summary>
        <p className="mt-3 text-gray-500">Select this eSIM for mobile data and turn on roaming.</p>
        {installation.apn ? <>
          <p className="mt-3 text-gray-500">If you have signal but no internet, open this eSIM’s Access point names in phone settings. Add the details below, save, and select Pocket.</p>
          <dl className="my-4 space-y-2"><div className="flex justify-between gap-4"><dt className="text-gray-500">Name</dt><dd>Pocket</dd></div><div className="flex justify-between gap-4"><dt className="text-gray-500">APN</dt><dd className="break-all">{installation.apn}</dd></div></dl>
          <button type="button" className="py-2 text-sm font-medium" onClick={() => { void navigator.clipboard.writeText(installation.apn!).then(() => setApnCopied(true)).catch(() => setError('Could not copy. Use the internet setting shown above.')) }}>{apnCopied ? 'Copied' : 'Copy internet setting'}</button>
        </> : <p className="mt-3 text-gray-500">If internet still does not connect, contact Pocket support from your profile.</p>}
        {canOpenEsimSettings() && <button type="button" className="pocket-cta-primary mt-4 w-full" onClick={() => { void openEsimSettings().catch(() => setError('Open mobile network settings on your phone.')) }}>Open phone settings</button>}
      </details>
      <details className="group my-5 text-sm" open={esimDevicePlatform() === 'web'}><summary className="flex list-none cursor-pointer items-center justify-between font-medium [&::-webkit-details-marker]:hidden"><span>Other installation options</span><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></summary>
      <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-4"><QRCodeSVG value={installation.activationCode} size={200} /></div>
      <p className="my-4 text-center text-sm text-gray-500">Scan this code from another screen using your phone’s eSIM setup.</p>
      <details className="group my-5 text-sm"><summary className="flex list-none cursor-pointer items-center justify-between font-medium [&::-webkit-details-marker]:hidden"><span>Manual installation</span><ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" /></summary><dl className="mt-4 space-y-3 break-all"><dt className="text-gray-500">SM-DP+ address</dt><dd>{installation.activationCode.split('$')[1]}</dd><dt className="text-gray-500">Activation code</dt><dd>{installation.activationCode.split('$').slice(2).join('$')}</dd><dt className="text-gray-500">ICCID</dt><dd>{installation.iccid}</dd></dl></details>
      <button type="button" className="py-2 text-sm font-medium" onClick={() => { void navigator.clipboard.writeText(installation.activationCode).then(() => setCopy(true)).catch(() => setError('Could not copy. Open manual installation.')) }}>{copy ? 'Copied' : 'Copy activation code'}</button>
      </details>
    </> : !error ? <PocketInlineRowsSkeleton label="Loading eSIM details" rows={3} /> : <button type="button" className="pocket-cta-primary w-full" onClick={() => setInstallationRetry(value => value + 1)}>Try again</button>}
    {!expired && !depleted && topUpDestinations === null && !topUpError && catalog?.purchaseEnabled && <PocketSkeletonBar className="mt-4 h-12 w-full rounded-2xl" />}
    {!expired && !depleted && topUpDestinations?.some(destination => destination.plans.length > 0) && <button type="button" className="pocket-cta-secondary mt-4 w-full" onClick={() => setTopUpOpen(true)}>Add data to this eSIM</button>}
    {!expired && !depleted && topUpDestinations && !topUpDestinations.some(destination => destination.plans.length > 0) && !topUpError && catalog?.purchaseEnabled && <><p className="mt-4 text-sm text-gray-500">This eSIM can’t be topped up. Choose another plan to get a new eSIM.</p><button type="button" className="pocket-cta-secondary mt-3 w-full" onClick={onBrowsePlans}>Choose another plan</button></>}
    {topUpError && <div className="mt-4"><p role="status" className="text-sm text-gray-500">{topUpError}</p><button type="button" className="mt-2 text-sm font-medium" onClick={() => setTopUpRetry(value => value + 1)}>Try again</button></div>}
      {expired && <p className="mb-3 text-sm text-gray-500">This eSIM can’t be topped up after it expires. A new plan needs a new eSIM.</p>}
      {depleted && <p className="mb-3 text-sm text-gray-500">This eSIM can’t be topped up after its data runs out. A new plan needs a new eSIM.</p>}
      {(expired || depleted) && <button type="button" className="pocket-cta-primary mt-2 w-full" onClick={onBrowsePlans}>Choose another plan</button>}
    {error && <p role="status" className="mt-4 text-sm text-gray-500">{error}</p>}
    </>}
  </PocketBottomSheet>
  return <PocketBottomSheet title="My eSIMs" onClose={onClose}>
    {arrivalCountryCode && catalog && orders && !error && <div role="status" className="mb-4 rounded-2xl bg-gray-100 p-4 text-sm leading-6 dark:bg-[#171717]">{matchingArrivalOrder ? <><p>A saved plan lists coverage in {arrivalName}. Open it to review your current eSIM.</p><button type="button" className="mt-2 text-sm font-semibold" onClick={() => { setError(''); setSelected(matchingArrivalOrder) }}>Open matching eSIM</button></> : <><p>We couldn’t confirm that a saved plan covers {arrivalName}. Check available plans before using mobile data.</p><button type="button" className="mt-2 text-sm font-semibold" onClick={() => onBrowsePlans(arrivalCountryCode)}>Browse {arrivalName} plans</button></>}</div>}
    {!orders && !error ? <PocketListSkeleton label="Loading your eSIMs" rows={2} /> : orders?.length ? <div className="divide-y divide-gray-100 dark:divide-[#262626]">{orders.map(item => <button key={item.id} className="flex min-h-20 w-full items-center justify-between gap-4 py-4 text-left" onClick={() => { setError(''); setSelected(item) }}><span><span className="block text-sm font-semibold">{title(item)}</span><span className="mt-1 block text-xs text-gray-500">{pocketEsimStatus(item.state).label}</span></span><span className="whitespace-nowrap text-sm"><MoneyAmount currency={pocketEsimDisplayCurrency(item.asset)} amount={Number(item.state === 'refunded' ? item.price.total : (item.totalDebit || item.price.total)).toFixed(2)}/></span></button>)}</div> : !error && <p className="py-8 text-center text-sm text-gray-500">Your eSIMs will appear here.</p>}
    {error && <><p role="status" className="my-4 text-sm text-gray-500">{error}</p><button className="pocket-cta-primary w-full" onClick={() => setRetry(value => value + 1)}>Try again</button></>}
  </PocketBottomSheet>
}
