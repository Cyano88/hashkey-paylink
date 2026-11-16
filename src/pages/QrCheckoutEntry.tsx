import {useEffect,useRef,useState} from 'react'
import {useParams,useNavigate,useLocation} from 'react-router-dom'
import CheckoutChoice from '../components/CheckoutChoice'
import CheckoutAssetChoice from '../components/CheckoutAssetChoice'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from '../components/CheckoutChrome'
import {readXPayJson} from '../pocket/lib/pocketXPayRead'
import type {XPayCheckout} from '../pocket/lib/pocketUnifiedXPay'
import {publicXPayCheckoutUrl} from '../lib/publicXPayCheckoutUrl'

/** QR supplies the merchant and a flexible amount to the existing checkout UI. */
export default function QrCheckoutEntry(){
 const {checkoutId=''}=useParams(),navigate=useNavigate(),location=useLocation()
 const [checkout,setCheckout]=useState<XPayCheckout>(),[error,setError]=useState('')
 const attempt=useRef(crypto.randomUUID()),query=new URLSearchParams(location.search)
 const cash=query.get('method')==='cash_balance',browser=query.get('browser')==='1'
 useEffect(()=>{const abort=new AbortController();setCheckout(undefined);setError('');attempt.current=crypto.randomUUID();void readXPayJson('/api/pocket/xpay?id='+encodeURIComponent(checkoutId),{signal:abort.signal},true).then(r=>{if(!abort.signal.aborted)setCheckout(r.checkout)}).catch(e=>{if(!abort.signal.aborted)setError(e.message)});return()=>abort.abort()},[checkoutId])
 if(!checkout||error)return <main className="mx-auto max-w-md py-6"><HashPayLinkCheckoutBrand/>{error?<p role="alert" className="text-center text-sm text-gray-500">{error}</p>:<div role="status" aria-label="Opening checkout" className="h-80 animate-pulse rounded-3xl bg-gray-100"/>}<CheckoutFooter/></main>
 const banks=checkout.destinations.filter(d=>d.kind==='bank'),wallets=checkout.destinations.filter(d=>d.kind==='stablecoins')
 const options=wallets.flatMap(d=>(d.networks||[]).flatMap(network=>d.assets.map(asset=>({network,asset}))))
 const bank=banks[0]
 const enter=(cash:boolean)=>navigate(location.pathname+'?browser=1&method='+(cash?'cash_balance':'stablecoins'))
 if(!browser)return <div className="py-6"><CheckoutChoice id={checkout.id} merchant={checkout.name} amount="" stablecoinsEnabled={options.length>0} onCash={bank?()=>enter(true):undefined} onBrowser={()=>enter(false)} initialCash={cash}/></div>
 if(cash&&!bank)return <main className="mx-auto max-w-md py-6"><HashPayLinkCheckoutBrand/><p role="alert">Cash balance is not accepted by this merchant.</p><button onClick={()=>navigate(location.pathname)}>Back</button><CheckoutFooter/></main>
 return <CheckoutAssetChoice key={checkout.id+cash} cash={cash} checkout={{id:checkout.id,merchantName:checkout.name,amount:'',expiresAt:'',options,canChange:true}} qr={{currency:cash?bank.currency:undefined,onBack:()=>navigate(location.pathname),prepare:async(choice,amount,token)=>{
  const destination=cash?bank:wallets.find(d=>d.assets.includes(choice.asset)&&d.networks?.includes(choice.network))
  if(!destination)throw Error('This payment option is no longer available. Reopen the QR.')
  if(!cash){
   const r=await readXPayJson('/api/pocket/xpay',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'prepare-hosted',id:checkout.id,destinationId:destination.id,revision:destination.revision,network:choice.network,asset:choice.asset,amount,key:attempt.current})})
   if(!/^\/pay\/c\/(?:chk[bx]_[a-f0-9]{24}|chk_[a-zA-Z0-9]{8,40}\?attempt=[a-zA-Z0-9_-]{1,80})$/.test(r.checkoutUrl))throw Error('Checkout could not be verified.')
   return r.checkoutUrl+(r.checkoutUrl.includes('?')?'&':'?')+'browser=1'
  }
  const r=await readXPayJson('/api/ng-pos?merchant_id='+encodeURIComponent(destination.id),{},true)
  const target=new URL(publicXPayCheckoutUrl(r.merchant,window.location.origin,choice.network))
  target.searchParams.set('xpay_checkout_id',checkout.id);target.searchParams.set('qr_amount',amount)
  target.searchParams.set('method',cash?'cash_balance':'stablecoins')
  return target.pathname+target.search
 }}}/>
}
