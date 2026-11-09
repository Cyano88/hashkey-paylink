import {startVisibleCheckoutPoll} from '../lib/visibleCheckoutPoll'
import {checkoutPriceLabel,type CheckoutPricing} from '../lib/checkoutPricing'
import {CheckoutExpired} from '../components/CheckoutExpiry'
import { lazy, Suspense, useEffect, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Link, useParams, useNavigate, useLocation } from 'react-router-dom'
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
  checkout?:{paymentMethod?:'stablecoins'|'cash_balance';pricing?:CheckoutPricing;expiresAt?:string;id:string;bscCheckout?:boolean;stockCheckout?:boolean;status:string;amount:string;asset:string;merchantName:string;brandImageUrl?:string;title?:string;settlementCurrency?:string;settlementAmount?:string;paymentAttempt?:{status?:string}}
}

export default function HostedCheckoutEntry() {
  const navigate = useNavigate(), location=useLocation()
  const changePayment=new URLSearchParams(location.search).get('change')==='1'
  const { checkoutId = '' } = useParams()
  const attemptId = new URLSearchParams(location.search).get('attempt') ?? ''
  const [error, setError] = useState('')
  const [expiredReturn,setExpiredReturn]=useState<string|undefined>()
  const [expiredBrand,setExpiredBrand]=useState<{name?:string;logo?:string}>({})
  const [stock, setStock] = useState<HostedCheckoutLookup|null>(null)
  const [checkout, setCheckout] = useState<HostedCheckoutLookup|null>(null)
  const [selection,setSelection]=useState<{checkout:CheckoutSelectionView;returnUrl?:string}|null>(null)
  const cash=new URLSearchParams(location.search).get('method')==='cash_balance'
  const browser = new URLSearchParams(location.search).get('browser') === '1'

  const pocketMode=new URLSearchParams(location.search).get('mode')==='pocket'
  const handoffChange=(cash:boolean,opened:boolean)=>{
    const query=new URLSearchParams(location.search)
    if(opened){query.set('mode','pocket');query.set('method',cash?'cash_balance':'stablecoins');query.delete('change')}
    else {query.delete('mode');query.delete('method');query.set('change','1')}
    navigate({pathname:location.pathname,search:query.toString()},{replace:true})
  }

  useEffect(()=>{setSelection(null);setCheckout(null);setStock(null);setError('');setExpiredReturn(undefined);setExpiredBrand({})},[checkoutId])
  useEffect(() => {
    let cancelled = false
    async function openCheckout(signal: AbortSignal): Promise<boolean> {
        const response = await fetch(`/api/v2/checkouts?id=${encodeURIComponent(checkoutId)}&attempt=${encodeURIComponent(attemptId)}&purpose=return`, { cache: 'no-store', signal })
        const body = await response.json().catch(() => undefined) as HostedCheckoutLookup | undefined
        signal.throwIfAborted()
        if(cancelled)return false
        if(response.ok&&body?.ok)setError('')
        if(!cancelled&&response.status===410){setExpiredReturn(body?.returnUrl);setExpiredBrand({name:body?.merchantName,logo:body?.brandImageUrl})}
        if(response.ok&&body?.ok&&(body.checkout as any)?.selectionCheckout&&body.checkout?.id===checkoutId&&/^chks_[a-f0-9]{24}$/.test(checkoutId)){
          // Keep the parent QR stable while the phone selects or changes its pending route.
          // The server projects only the signed parent's exact child status here.
          if(pocketMode&&!browser&&!changePayment&&(!body.selectedCheckoutUrl||body.checkout.status==='pending')){
            setSelection({checkout:body.checkout as unknown as CheckoutSelectionView,returnUrl:body.returnUrl})
            return true
          }
          if(!cancelled){if(!(changePayment&&(body.checkout as unknown as CheckoutSelectionView).canChange)&&body.selectedCheckoutUrl&&/^\/pay\/c\/chk(?:b|x)?_[a-zA-Z0-9]{8,40}(?:\?attempt=[a-zA-Z0-9_-]+)?$/.test(body.selectedCheckoutUrl))navigate(body.selectedCheckoutUrl+(body.selectedCheckoutUrl.includes('?')?'&':'?')+((new URLSearchParams(location.search).get('browser')==='1')?'browser=1':new URLSearchParams(location.search).get('pocketFallback')==='1'?'pocketFallback=1':new URLSearchParams(location.search).get('mode')==='pocket'?'pocket=1':''),{replace:true});else setSelection({checkout:body.checkout as unknown as CheckoutSelectionView,returnUrl:body.returnUrl})}
          // The phone can select a child after this desktop handoff is displayed.
          return true
        }
        if(response.ok&&body?.ok&&body.checkout?.bscCheckout&&body.checkout.id===checkoutId&&/^chkb_[a-f0-9]{24}$/.test(checkoutId)){
          if(!cancelled)setCheckout(body)
          return !browser&&body.checkout.status!=='paid'
        }
        if(response.ok&&body?.ok&&body.checkout?.stockCheckout&&body.checkout.id===checkoutId&&/^chkx_[a-f0-9]{24}$/.test(checkoutId)){
          if(!cancelled)setStock(body)
          return !browser&&body.checkout.status!=='paid'
        }
        if (!response.ok || !body?.ok || body.checkout?.id !== checkoutId || !body.paymentUrl?.startsWith('/pay?')) {
          throw new Error(body?.error || 'This checkout could not be opened.')
        }
        if (!cancelled) {
          const status = body.checkout?.paymentAttempt?.status || body.checkout?.status
          if (browser || status === 'paid' || status === 'processing') navigate(body.paymentUrl, { replace: true })
          else {setCheckout(body); return true}
        }
      return false
    }
    const stop = startVisibleCheckoutPoll(openCheckout, (cause, timedOut) => {
      if (!cancelled) setError(timedOut ? 'Checkout took too long to respond. Please reopen the link.' : cause instanceof Error ? cause.message : 'This checkout could not be opened.')
    })
    return () => { cancelled = true; stop() }
  }, [attemptId, checkoutId, navigate, browser,changePayment,location.search,pocketMode])

  if(error&&/expired/i.test(error))return <CheckoutExpired merchant={expiredBrand.name||checkout?.checkout?.merchantName||stock?.checkout?.merchantName} brandImageUrl={expiredBrand.logo||checkout?.checkout?.brandImageUrl||stock?.checkout?.brandImageUrl} returnUrl={expiredReturn||checkout?.returnUrl||stock?.returnUrl}/>
  if(selection&&!error){const mode=new URLSearchParams(location.search).get('mode');return browser?<CheckoutAssetChoice cash={(cash||selection.checkout.paymentMethods?.length===1)&&selection.checkout.paymentMethods?.includes('cash_balance')} key={checkoutId+(cash?'cash':'stablecoins')} {...selection} mode={mode==='pocket'?'pocket':'web'}/>:<div className="py-6"><CheckoutChoice onHandoffChange={handoffChange} autoOpenPocket={mode==='pocket'} initialCash={pocketMode&&selection.checkout.selectedCheckoutId?selection.checkout.paymentMethod==='cash_balance':cash} stablecoinsEnabled={selection.checkout.options.some(o=>!o.unavailableReason)} onCash={selection.checkout.paymentMethods?.includes('cash_balance')?()=>navigate('/pay/c/'+checkoutId+'?browser=1&method=cash_balance'):undefined} id={checkoutId} merchant={selection.checkout.merchantName} brandImageUrl={selection.checkout.brandImageUrl} title={selection.checkout.title} expiresAt={selection.checkout.expiresAt} returnUrl={selection.returnUrl} amount={checkoutPriceLabel(selection.checkout.currency?{currency:selection.checkout.currency,amount:selection.checkout.amount}:undefined,selection.checkout.amount+' '+(selection.checkout.options[0]?.asset||''))} onBrowser={()=>navigate('/pay/c/'+checkoutId+'?browser=1')}/></div>}

  if(checkout?.checkout?.bscCheckout&&!browser&&checkout.checkout.status!=='paid')return <div className="py-6"><CheckoutChoice autoOpenPocket={new URLSearchParams(location.search).get('pocket')==='1'} expiresAt={checkout.checkout.expiresAt} returnUrl={checkout.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={checkout.checkout.brandImageUrl} merchant={checkout.checkout.merchantName} title={checkout.checkout.title} amount={checkoutPriceLabel(checkout.checkout.pricing,`${checkout.checkout.amount} ${checkout.checkout.asset}`)} onBrowser={()=>navigate('/pay/c/'+checkoutId+'?browser=1',{replace:true})}/></div>
  if(checkout?.checkout?.bscCheckout)return <Suspense fallback={<div role="status" aria-label="Opening payment" className="mx-auto h-96 max-w-md animate-pulse rounded-3xl bg-gray-100 dark:bg-white/5"/>}><BscCheckout checkout={checkout.checkout} returnUrl={checkout.returnUrl}/></Suspense>
  if(stock?.checkout&&!browser&&stock.checkout.status!=='paid')return <div className="py-6"><CheckoutChoice autoOpenPocket={new URLSearchParams(location.search).get('pocket')==='1'} expiresAt={stock.checkout.expiresAt} returnUrl={stock.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={stock.checkout.brandImageUrl} merchant={stock.checkout.merchantName} title={stock.checkout.title} amount={checkoutPriceLabel(stock.checkout.pricing,stock.checkout.amount+' '+stock.checkout.asset)} onBrowser={()=>navigate('/pay/c/'+checkoutId+'?browser=1',{replace:true})}/></div>
  if(stock?.checkout)return stock.checkout.status==='paid'
    ? <BrowserPaymentResult fullScreen state="successful" amount={checkoutPriceLabel(stock.checkout.pricing,stock.checkout.amount+' '+stock.checkout.asset)} merchant={stock.checkout.merchantName} returnUrl={stock.returnUrl} detail="Your merchant payment has been verified on X Layer." />
    : <Suspense fallback={<div role="status" aria-label="Opening checkout" className="mx-auto h-96 max-w-md animate-pulse rounded-3xl bg-gray-100 dark:bg-white/5"/>}><StockCheckout merchantOverride={checkoutId} returnUrl={stock.returnUrl} brandImageUrl={stock.checkout.brandImageUrl}/></Suspense>
  if (checkout?.checkout && (!error||/expired/i.test(error))) return <div className="py-6"><CheckoutChoice cashOnly={checkout.checkout.paymentMethod==='cash_balance'} autoOpenPocket={new URLSearchParams(location.search).get('pocket')==='1'} expiresAt={checkout.checkout.expiresAt} returnUrl={checkout.returnUrl} id={checkoutId} attempt={attemptId} brandImageUrl={checkout.checkout.brandImageUrl} merchant={checkout.checkout.merchantName} title={checkout.checkout.title} amount={checkoutPriceLabel(checkout.checkout.pricing,checkout.checkout.settlementCurrency ? `${checkout.checkout.settlementCurrency} ${checkout.checkout.settlementAmount}` : `${checkout.checkout.amount} ${checkout.checkout.asset || 'USDC'}`)} onBrowser={()=>navigate(checkout.paymentUrl!,{replace:true})}/></div>
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
