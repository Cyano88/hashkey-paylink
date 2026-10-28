import {CheckoutExpired} from '../components/CheckoutExpiry'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { CheckoutFooter, HashPayLinkCheckoutBrand } from '../components/CheckoutChrome'
import BrowserPaymentResult from '../components/BrowserPaymentResult'
import CheckoutChoice from '../components/CheckoutChoice'
import CheckoutAssetChoice,{type CheckoutSelectionView} from '../components/CheckoutAssetChoice'
const BscCheckout=lazy(()=>import('./BscCheckoutPage'))
const StockCheckout = lazy(()=>import('../pocket/pages/PocketXPayCheckoutPage'))

type HostedCheckoutLookup = {
  ok?: boolean
  paymentUrl?: string
  error?: string
  returnUrl?:string
  merchantName?:string
  brandImageUrl?:string
  selectedCheckoutUrl?:string
  checkout?:{expiresAt?:string;id:string;bscCheckout?:boolean;stockCheckout?:boolean;status:string;amount:string;asset:string;merchantName:string;brandImageUrl?:string;title?:string;settlementCurrency?:string;settlementAmount?:string;paymentAttempt?:{status?:string}}
}

export default function HostedCheckoutEntry() {
  const navigate = useNavigate()
  const { checkoutId = '' } = useParams()
  const attemptId = new URLSearchParams(window.location.search).get('attempt') ?? ''
  const [error, setError] = useState('')
  const [expiredReturn,setExpiredReturn]=useState<string|undefined>()
  const [expiredBrand,setExpiredBrand]=useState<{name?:string;logo?:string}>({})
  const [stock, setStock] = useState<HostedCheckoutLookup|null>(null)
  const [checkout, setCheckout] = useState<HostedCheckoutLookup|null>(null)
  const [selection,setSelection]=useState<{checkout:CheckoutSelectionView;returnUrl?:string}|null>(null)
  const browser = new URLSearchParams(window.location.search).get('browser') === '1'

  useEffect(() => {
    let cancelled = false
    const controller = new AbortController()
    let timeout: ReturnType<typeof setTimeout>
    let poll: ReturnType<typeof setTimeout>
    setError(''); setExpiredReturn(undefined); setExpiredBrand({}); setCheckout(null); setStock(null);setSelection(null)
    async function openCheckout() {
      timeout = setTimeout(() => controller.abort(), 15000)
      try {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}&attempt=${encodeURIComponent(attemptId)}&purpose=return`, { cache: 'no-store', signal: controller.signal })
        const body = await response.json().catch(() => undefined) as HostedCheckoutLookup | undefined
        if(!cancelled&&response.status===410){setExpiredReturn(body?.returnUrl);setExpiredBrand({name:body?.merchantName,logo:body?.brandImageUrl})}
        if(response.ok&&body?.ok&&(body.checkout as any)?.selectionCheckout&&body.checkout?.id===checkoutId&&/^chks_[a-f0-9]{24}$/.test(checkoutId)){
          if(!cancelled){if(body.selectedCheckoutUrl&&/^\/pay\/c\/chk(?:b|x)?_[a-zA-Z0-9]{8,40}(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(body.selectedCheckoutUrl))navigate(body.selectedCheckoutUrl,{replace:true});else setSelection({checkout:body.checkout as unknown as CheckoutSelectionView,returnUrl:body.returnUrl})}
          return
        }
        if(response.ok&&body?.ok&&body.checkout?.bscCheckout&&body.checkout.id===checkoutId&&/^chkb_[a-f0-9]{24}$/.test(checkoutId)){
          if(!cancelled){setCheckout(body);if(!browser&&body.checkout.status!=='paid')poll=setTimeout(()=>void openCheckout(),10000)}
          return
        }
        if(response.ok&&body?.ok&&body.checkout?.stockCheckout&&body.checkout.id===checkoutId&&/^chkx_[a-f0-9]{24}$/.test(checkoutId)){
          if(!cancelled){setStock(body);if(!browser&&body.checkout.status!=='paid')poll=setTimeout(()=>void openCheckout(),10000)}
          return
        }
        if (!response.ok || !body?.ok || body.checkout?.id !== checkoutId || !body.paymentUrl?.startsWith('/pay?')) {
          throw new Error(body?.error || 'This checkout could not be opened.')
        }
        if (!cancelled) {
          const status = body.checkout?.paymentAttempt?.status || body.checkout?.status
          if (browser || status === 'paid' || status === 'processing') navigate(body.paymentUrl, { replace: true })
          else {setCheckout(body); poll = setTimeout(() => void openCheckout(), 10000)}
        }
      } catch (cause) {
        if (!cancelled) setError(controller.signal.aborted ? 'Checkout took too long to respond. Please reopen the link.' : cause instanceof Error ? cause.message : 'This checkout could not be opened.')
      } finally {
        window.clearTimeout(timeout)
      }
    }
    void openCheckout()
    return () => { cancelled = true; controller.abort(); clearTimeout(timeout); clearTimeout(poll) }
  }, [attemptId, checkoutId, navigate, browser])

  if(error&&/expired/i.test(error))return <CheckoutExpired merchant={expiredBrand.name||checkout?.checkout?.merchantName||stock?.checkout?.merchantName} brandImageUrl={expiredBrand.logo||checkout?.checkout?.brandImageUrl||stock?.checkout?.brandImageUrl} returnUrl={expiredReturn||checkout?.returnUrl||stock?.returnUrl}/>
  if(selection)return <CheckoutAssetChoice key={checkoutId} {...selection}/>
  if(checkout?.checkout?.bscCheckout&&!browser&&checkout.checkout.status!=='paid')return <div className="py-6"><CheckoutChoice expiresAt={checkout.checkout.expiresAt} returnUrl={checkout.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={checkout.checkout.brandImageUrl} merchant={checkout.checkout.merchantName} title={checkout.checkout.title} amount={`${checkout.checkout.amount} ${checkout.checkout.asset}`} onBrowser={()=>navigate('/pay/c/'+checkoutId+'?browser=1',{replace:true})}/></div>
  if(checkout?.checkout?.bscCheckout)return <Suspense fallback={<div role="status" aria-label="Opening payment" className="mx-auto h-96 max-w-md animate-pulse rounded-3xl bg-gray-100 dark:bg-white/5"/>}><BscCheckout checkout={checkout.checkout} returnUrl={checkout.returnUrl}/></Suspense>
  if(stock?.checkout&&!browser&&stock.checkout.status!=='paid')return <div className="py-6"><CheckoutChoice expiresAt={stock.checkout.expiresAt} returnUrl={stock.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={stock.checkout.brandImageUrl} merchant={stock.checkout.merchantName} title={stock.checkout.title} amount={stock.checkout.amount+' '+stock.checkout.asset} onBrowser={()=>navigate('/pay/c/'+checkoutId+'?browser=1',{replace:true})}/></div>
  if(stock?.checkout)return stock.checkout.status==='paid'
    ? <BrowserPaymentResult fullScreen state="successful" amount={stock.checkout.amount+' '+stock.checkout.asset} merchant={stock.checkout.merchantName} returnUrl={stock.returnUrl} detail="Your merchant payment has been verified on X Layer." />
    : <Suspense fallback={<div role="status" aria-label="Opening checkout" className="mx-auto h-96 max-w-md animate-pulse rounded-3xl bg-gray-100 dark:bg-white/5"/>}><StockCheckout merchantOverride={checkoutId} returnUrl={stock.returnUrl} brandImageUrl={stock.checkout.brandImageUrl}/></Suspense>
  if (checkout?.checkout && (!error||/expired/i.test(error))) return <div className="py-6"><CheckoutChoice expiresAt={checkout.checkout.expiresAt} returnUrl={checkout.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={checkout.checkout.brandImageUrl} merchant={checkout.checkout.merchantName} title={checkout.checkout.title} amount={checkout.checkout.settlementCurrency ? `${checkout.checkout.settlementCurrency} ${checkout.checkout.settlementAmount}` : `${checkout.checkout.amount} ${checkout.checkout.asset || 'USDC'}`} onBrowser={()=>navigate(checkout.paymentUrl!,{replace:true})}/></div>
  return (
    <div className="mx-auto w-full max-w-sm">
      <HashPayLinkCheckoutBrand />
      <section className="rounded-[1.35rem] border border-gray-200/80 bg-white p-6 text-center shadow-[0_18px_60px_-32px_rgba(15,23,42,0.42)] dark:border-white/10 dark:bg-[#101114]">
        {error ? (
          <>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-400/10"><AlertCircle className="h-5 w-5" /></span>
            <h1 className="mt-4 text-lg font-bold text-gray-950 dark:text-white">Checkout unavailable</h1>
            <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">{error}</p>
            <Link to="/" className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-gray-950 px-4 text-sm font-semibold text-white dark:bg-white dark:text-gray-950">Hash PayLink</Link>
          </>
        ) : (
          <>
            <span aria-label="Verifying checkout" className="mx-auto block h-7 w-28 animate-pulse rounded bg-gray-200 dark:bg-white/10" />
            <div className="mx-auto mt-6 h-9 w-36 animate-pulse rounded bg-gray-100 dark:bg-white/5"/>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Verifying payment details…</p>
          </>
        )}
      </section>
      <CheckoutFooter />
    </div>
  )
}
