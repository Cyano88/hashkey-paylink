import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import { PRIVY_APP_ID } from '../lib/authMode'
import { HashPayLinkCheckoutBrand, CheckoutTrustLine } from '../components/CheckoutChrome'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'
import PocketStockWalletActions from '../pocket/components/PocketStockWalletActions'
import PocketPaymentSecurityGate from '../pocket/components/PocketPaymentSecurityGate'
import usePocketIdentity from '../pocket/hooks/usePocketIdentity'
import usePocketStockWallet from '../pocket/hooks/usePocketStockWallet'

type Session = {id:string;projectName:string;walletAppId:string;wallet:string;chainId:196}
export default function StockWalletPage() {
  const { sessionId = '' } = useParams(), { ready, authenticated, user, logout } = usePrivy()
  if (!/^wst_[a-f0-9]{64}$/.test(sessionId)) return <p role="alert">Invalid wallet link.</p>
  return <section className="mx-auto w-full max-w-md"><HashPayLinkCheckoutBrand />
    {!ready ? <p role="status" className="p-5 text-sm">Opening wallet...</p> : !authenticated ? <div className="rounded-3xl border p-5"><h1 className="mb-4 text-lg font-bold">Sign in to send stocks</h1><PocketEmailLogin context="agreement" /></div> : <Connected key={user?.id + ':' + sessionId} sessionId={sessionId} />}
    <CheckoutTrustLine provider="hashpaylink" />
    {authenticated && <button type="button" className="mt-4 min-h-11 w-full text-xs text-gray-500" onClick={() => void logout()}>Switch account</button>}
  </section>
}
function Connected({sessionId}:{sessionId:string}) {
  const identity = usePocketIdentity(), [session,setSession] = useState<Session>(), [error,setError] = useState(''), [revision,setRevision] = useState(0)
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => {controller.abort();setError('Wallet took too long to open. Try again.')},30000)
    void (async () => {
      const token = await identity.getAccessToken(); if (controller.signal.aborted) return
      if (!token) throw Error('Sign in again to continue.')
      const r = await fetch('/api/v2/wallets/stocks/participant',{method:'POST',signal:controller.signal,headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({sessionId,action:'read'})})
      const data = await r.json()
      if (!r.ok || !data.ok) throw Error(data.error || 'Wallet could not open.')
      if (data.session?.id !== sessionId || data.session.walletAppId !== PRIVY_APP_ID || data.session.chainId !== 196 || !/^0x[a-fA-F0-9]{40}$/.test(data.session.wallet)) throw Error('Wallet details did not match this connection.')
      if (!controller.signal.aborted) {setSession(data.session);setError('')}
    })().catch(e => {if(!controller.signal.aborted)setError(e.message)}).finally(()=>clearTimeout(timer))
    return () => {controller.abort();clearTimeout(timer)}
  },[sessionId,identity.getAccessToken,revision])
  return session ? <><h1 className="my-4 text-center text-lg font-bold">Send xStocks</h1><p className="mb-4 text-center text-xs text-gray-500">{session.projectName} &middot; Your Hash PayLink wallet</p><PocketPaymentSecurityGate email={identity.email} getAccessToken={identity.getAccessToken}><Send expectedWallet={session.wallet}/></PocketPaymentSecurityGate></> : error ? <div role="alert" className="mt-5 text-sm text-red-600">{error}<button className="block min-h-11 underline" onClick={()=>{setError('');setRevision(n=>n+1)}}>Try again</button></div> : <div role="status" aria-label="Opening stock wallet" className="mt-5 h-40 animate-pulse rounded-3xl bg-gray-100 motion-reduce:animate-none dark:bg-white/5" />
}
function Send({expectedWallet}:{expectedWallet:string}) {
  const wallet = usePocketStockWallet()
  if (wallet.address && wallet.address.toLowerCase() !== expectedWallet.toLowerCase()) return <p role="alert" className="text-sm text-red-600">This is a different wallet. Switch to the connected account.</p>
  return <PocketStockWalletActions wallet={wallet} view="send" />
}
