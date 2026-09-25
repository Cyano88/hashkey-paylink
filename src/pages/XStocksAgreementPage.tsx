import { pocketEmbeddedAddresses, retryPocketEmbeddedWallet } from '../pocket/lib/pocketEmbeddedWallet'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy, useWallets, useCreateWallet } from '@privy-io/react-auth'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import { CheckoutTrustLine, HashPayLinkCheckoutBrand } from '../components/CheckoutChrome'
import HostedWorkCheckout from '../components/xstocksAgreement/HostedWorkCheckout'
import { createHostedWorkRequest, type HostedReply } from '../lib/xstocksAgreement/hostedClient'
import { PRIVY_APP_ID } from '../lib/authMode'

const button='min-h-11 w-full rounded-full bg-gray-950 px-5 py-3 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
async function responseJson(response:Response){
  const data=await response.json().catch(()=>{throw Error('Checkout could not load. Please try again.')})
  if(!response.ok||data.ok!==true)throw Error(typeof data.error==='string'?data.error:'Checkout is unavailable.')
  return data
}
export default function XStocksAgreementPage(){
  const {agreementId=''}=useParams()
  const {ready,authenticated,user,logout}=usePrivy()
  if(!/^xag_[a-f0-9]{64}$/.test(agreementId))return <p role='alert' className='text-center text-sm'>This Agreement link is invalid.</p>
  return <section className='mx-auto w-full max-w-md'>
    <HashPayLinkCheckoutBrand/>
    <div className='rounded-[1.35rem] border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#111216] sm:p-6'>
      <p className='text-xs font-semibold text-gray-500'>Agreement checkout</p>
      {!ready?<p className='mt-4 text-sm' role='status'>Opening checkout…</p>:!authenticated?<>
        <h1 className='mt-2 text-xl font-bold'>Pay with xStocks</h1>
        <p className='mb-5 mt-2 text-sm text-gray-500'>Sign in to Hash PayLink to review your Agreement.</p>
        <PocketEmailLogin context='agreement'/>
      </>:<ConnectedAgreement key={user?.id+':'+agreementId} agreementId={agreementId}/>}
    </div>
    <CheckoutTrustLine provider='hashpaylink'/>
    {authenticated&&<button type='button' className='mx-auto mt-3 block min-h-11 text-xs text-gray-500 underline' onClick={()=>void logout()}>Switch account</button>}
  </section>
}
function ConnectedAgreement({agreementId}:{agreementId:string}){
  const {user,getAccessToken,ready,authenticated}=usePrivy(),{wallets}=useWallets(),{createWallet}=useCreateWallet()
  const [session,setSession]=useState<{reply:HostedReply;request:ReturnType<typeof createHostedWorkRequest>}>()
  const [error,setError]=useState(''),[retry,setRetry]=useState(0),[creating,setCreating]=useState(false)
  const creatingRef=useRef(false),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    const controller=new AbortController();let active=true
    setSession(undefined);setError('')
    const post=async(payload:Record<string,unknown>):Promise<HostedReply>=>{
      const token=await getAccessToken()
      if(!active||!token)throw Error('Sign in again to continue.')
      const reply=await responseJson(await fetch('/api/v2/xstocks-agreements/participant',{
        method:'POST',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+token},
        body:JSON.stringify(payload),
      })) as HostedReply
      if(!active)throw Error('Your account changed. Reopen the Agreement.')
      if(reply.agreement.id!==agreementId||!['customer','provider'].includes(reply.role))throw Error('The checkout does not match this Agreement link.')
      if(reply.agreement.walletAppId!==PRIVY_APP_ID)throw Error('The checkout wallet configuration does not match this Agreement. Contact support.')
      return reply
    }
    void post({agreementId,action:'read'}).then(reply=>{
      if(active)setSession({reply,request:createHostedWorkRequest(reply,post,next=>setSession(current=>current?{...current,reply:next}:current))})
    }).catch(error=>{if(active)setError(error.message)})
    return()=>{active=false;controller.abort()}
  },[agreementId,retry,getAccessToken])
  const embedded=wallets.filter(wallet=>wallet.walletClientType==='privy')
  const hasLinkedWallet=pocketEmbeddedAddresses(user).length>0
  async function setupWallet(){
    if(creatingRef.current||!ready||!authenticated||!user?.id||hasLinkedWallet||embedded.length||!session||session.reply.agreement.accepted[session.reply.role])return
    creatingRef.current=true;setCreating(true);setError('')
    try{await retryPocketEmbeddedWallet(user.id,createWallet)}catch(error){if(alive.current)setError((error as Error).message)}
    finally{if(alive.current){creatingRef.current=false;setCreating(false)}}
  }
  const agreement=session?.reply.agreement
  return <>
    {agreement?<>
      <h1 className='mt-2 break-words text-xl font-bold'>{agreement.terms.title}</h1>
      <p className='mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-gray-500'>{agreement.terms.description}</p>
      <p className='mt-3 text-xs text-gray-500'>You are the {session.reply.role==='customer'?(agreement.terms.kind==='trade'?'buyer':'client'):(agreement.terms.kind==='trade'?'seller':'worker')} · X Layer</p>
      {ready&&!embedded.length&&!hasLinkedWallet&&!agreement.accepted[session.reply.role]&&session.reply.fundingEnabled&&
        <button className={button+' mt-4'} disabled={creating} onClick={()=>void setupWallet()}>{creating?'Setting up wallet…':'Set up payment wallet'}</button>}
      {hasLinkedWallet&&ready&&!embedded.length&&<p className='mt-3 text-sm'>Restoring your existing payment wallet. Sign in again if it does not load.</p>}
      {embedded.length>1&&<p className='mt-3 text-sm' role='alert'>More than one embedded wallet is linked. Contact support to continue.</p>}
      {agreement.terms.kind==='trade'&&agreement.terms.trade&&<dl className='mt-4 space-y-2 text-xs text-gray-500'>
        <div><dt>Item quantity</dt><dd>{agreement.terms.trade.price}</dd></div>
        <div><dt>Delivery fee</dt><dd>{agreement.terms.trade.deliveryFee}</dd></div>
        <div><dt>Handover</dt><dd>{agreement.terms.trade.handover} - {agreement.terms.trade.location}</dd></div>
        {agreement.terms.trade.carrier&&<div><dt>Carrier</dt><dd>{agreement.terms.trade.carrier}</dd></div>}
        <div><dt>Return terms</dt><dd className='whitespace-pre-wrap break-words'>{agreement.terms.trade.returns}</dd></div>
      </dl>}
      <HostedWorkCheckout item={{id:agreement.id,activeVersion:agreement.terms.version,role:session.reply.role,terms:[agreement.terms]}}
        request={session.request} onUpdated={()=>{}}/>
    </>:!error&&<p className='mt-4 text-sm' role='status'>Loading Agreement…</p>}
    {error&&<div className='mt-4'><p className='text-sm text-red-600' role='alert'>{error}</p><button className='mt-2 min-h-11 text-sm underline' onClick={()=>setRetry(value=>value+1)}>Try again</button></div>}
  </>
}
