import {CheckoutCountdown,CheckoutExpired,useCheckoutExpiry,checkoutSecondsLeft} from './CheckoutExpiry'
import CheckoutMerchant from './CheckoutMerchant'
import {CheckoutFooter,HashPayLinkCheckoutBrand} from './CheckoutChrome'
import {checkoutMessage} from '../lib/checkoutMessage'
import {useEffect,useRef,useState} from 'react'
import {QRCodeSVG} from 'qrcode.react'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import {checkoutHandoff} from '../lib/checkoutHandoff'

type Props={expiresAt?:string;returnUrl?:string;quoteLoading?:boolean;brandImageUrl?:string;fundingHint?:string;asset?:string;signOut?:()=>Promise<void>;nameInput?:{value:string;onChange:(value:string)=>void};amountInput?:{value:string;currency:string;onChange:(value:string)=>void};id:string;attempt:string;merchant:string;title:string;amount:string;fiat:boolean;authenticated:boolean;email:string;network:string;networks:Array<{value:string;label:string}>;onNetwork:(value:string)=>void;walletReady:boolean;address:string;balance:string|null;shortfall:string|null;total:string|null;fee:string|null;busy:boolean;blocked:boolean;error:string;prepare:()=>Promise<void>;refresh:()=>Promise<unknown>;pay:()=>Promise<void>}
export default function BrowserCheckoutCard(p:Props){
 const asset=p.asset||'USDC'
 const seconds=useCheckoutExpiry(p.expiresAt)
 const [funding,setFunding]=useState(false),[localBusy,setLocalBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false)
 const lock=useRef(false),refreshRef=useRef(p.refresh);refreshRef.current=p.refresh
 const handoff=checkoutHandoff(p.id,p.attempt)
 async function run(action:()=>Promise<unknown>){if(lock.current||p.busy)return;lock.current=true;setLocalBusy(true);setError('');try{if(checkoutSecondsLeft(p.expiresAt)===0)throw Error('Checkout expired. Return to the store.');await action()}catch(e){setError((e as Error).message||'Please try again.')}finally{lock.current=false;setLocalBusy(false)}}
 useEffect(()=>{setFunding(false);setCopied(false);setError('')},[p.network,p.address,p.email])
 useEffect(()=>{if(!funding||seconds===0)return;let active=true,timer:ReturnType<typeof setTimeout>;const tick=async()=>{if(!active)return;if(document.visibilityState==='visible'&&!lock.current){lock.current=true;try{await refreshRef.current();if(active)setError('')}catch{if(active)setError('Balance could not be refreshed. Try again.')}finally{lock.current=false}}if(active)timer=setTimeout(tick,10000)};timer=setTimeout(tick,5000);return()=>{active=false;clearTimeout(timer)}},[funding,seconds===0])
 const busy=p.busy||localBusy
 const message=busy?'':checkoutMessage(error||p.error)
 const needsRefresh=p.walletReady&&(p.balance===null||p.total===null)
 const canFund=Boolean(p.shortfall&&p.address)
 if(seconds===0&&!busy)return <CheckoutExpired returnUrl={p.returnUrl} merchant={p.merchant} brandImageUrl={p.brandImageUrl}/>
 return <main className="mx-auto w-full max-w-md py-6 text-gray-950 dark:text-white"><HashPayLinkCheckoutBrand/><section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-white/10 dark:bg-[#101114] sm:p-8">
  <CheckoutMerchant name={p.merchant} logo={p.brandImageUrl}/><h1 className="mt-3 text-center text-3xl font-semibold tracking-tight">{p.amount}</h1>{p.title&&<p className="mt-2 text-center text-sm text-gray-500">{p.title}</p>}
  <CheckoutCountdown seconds={seconds}/>
  {!p.authenticated?<div className="mt-8"><PocketEmailLogin context="checkout"/></div>:<>
   <div className="mt-6 flex items-center justify-between gap-3"><p className="min-w-0 break-all text-xs text-gray-500">{p.email}</p>{p.signOut&&<button disabled={busy} onClick={()=>void run(p.signOut!)} className="shrink-0 py-2 text-xs font-medium">Change account</button>}</div>
   {p.amountInput&&<label className="mt-5 block text-sm">Amount ({p.amountInput.currency})<input aria-label="Payment amount" inputMode="decimal" value={p.amountInput.value} disabled={busy} onChange={e=>{if(/^\d*(?:\.\d{0,6})?$/.test(e.target.value))p.amountInput!.onChange(e.target.value)}} className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10"/></label>}
   {p.nameInput&&<label className="mt-5 block text-sm">Your name<input autoComplete="name" value={p.nameInput.value} disabled={busy} onChange={e=>p.nameInput!.onChange(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10"/></label>}
   {!p.fiat&&p.networks.length>1&&<label className="mt-5 block text-sm">Payment network<select aria-label="Payment network" disabled={busy} value={p.network} onChange={e=>p.onNetwork(e.target.value)} className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 dark:border-white/10">{p.networks.map(n=><option key={n.value} value={n.value}>{n.label}</option>)}</select></label>}
   {p.walletReady&&<div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4 dark:bg-white/5"><span className="text-sm">{p.fiat?'Cash balance':asset+' balance'}</span>{p.balance===null&&message?<span className="text-xs text-gray-500">Unavailable</span>:p.balance===null?<span aria-label="Checking balance" className="h-4 w-20 animate-pulse rounded bg-gray-200 dark:bg-white/10"/>:<span className="text-sm font-semibold">{p.balance} {asset}</span>}</div>}
   {funding&&p.address&&<div className="mt-5 rounded-2xl border border-gray-200 p-4 text-center dark:border-white/10"><h2 className="text-sm font-semibold">{p.fiat?'Add cash':'Add '+asset}</h2><p className="mt-2 text-xs text-gray-500">{p.fundingHint||(p.shortfall?'Add at least '+p.shortfall+' '+asset+', including the current fees.':'Balance updated. Return to review your payment.')}</p><div className="mx-auto mt-4 w-fit rounded-xl bg-white p-3"><QRCodeSVG value={p.address} size={120}/></div><p className="mt-3 break-all font-mono text-xs">{p.address}</p><p className="mt-3 text-xs font-medium">Send {asset} on {p.networks.find(n=>n.value===p.network)?.label||p.network} only.</p><button disabled={busy} onClick={()=>void run(async()=>{await navigator.clipboard.writeText(p.address);setCopied(true)})} className="mt-3 min-h-11 text-sm font-semibold">{copied?'Copied':'Copy address'}</button><p className="text-xs leading-5 text-gray-500">This funds your wallet. Payment still requires your approval.</p><a href={/Android/i.test(navigator.userAgent)?handoff.android:handoff.url} className="mt-3 block py-3 text-sm font-medium">Manage funds in Pocket</a></div>}
   {p.walletReady&&p.total!==null&&p.fee!==null&&<dl className="mt-5 space-y-2 text-sm"><div className="flex justify-between"><dt className="text-gray-500">Fees</dt><dd>{p.fee+' '+asset}</dd></div><div className="flex justify-between font-semibold"><dt>You pay</dt><dd>{p.total+' '+asset}</dd></div></dl>}
   {p.walletReady&&p.quoteLoading&&!canFund&&!message&&p.total===null&&<div aria-label="Checking fees" className="mt-5 space-y-3"><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-white/10"/><div className="h-4 animate-pulse rounded bg-gray-100 dark:bg-white/10"/></div>}
   {message?<p role="alert" className="mt-5 text-center text-sm leading-5 text-gray-500">{message}</p>:!p.walletReady&&<p className="mt-5 text-center text-sm leading-5 text-gray-500">Confirm your email to access your balance securely.</p>}
   <button disabled={busy||p.blocked||(!funding&&!canFund&&Boolean(p.quoteLoading))} onClick={()=>void run(async()=>{if(!p.walletReady){await p.prepare();return}if(funding){setFunding(false);return}if(canFund){setFunding(true);return}if(needsRefresh){await p.refresh();return}await p.pay()})} className="mt-6 min-h-12 w-full rounded-full bg-gray-950 px-4 text-sm font-semibold text-white disabled:opacity-45 dark:bg-white dark:text-gray-950">{busy?'Please wait…':!p.walletReady?'Continue':funding?'Return to payment':canFund?'Add funds':needsRefresh?'Continue':'Pay securely'}</button>
   {p.walletReady&&!busy&&<button onClick={()=>void run(p.refresh)} className="mt-2 min-h-11 w-full text-xs text-gray-500">Update balance</button>}
  </>}
  <a href={handoff.browser.replace('browser=1','choose=1')} className="mt-5 block py-2 text-center text-xs text-gray-500">Other ways to continue</a>
 </section><CheckoutFooter/></main>
}
