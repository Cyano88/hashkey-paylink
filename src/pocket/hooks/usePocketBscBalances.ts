import {useCallback,useEffect,useRef,useSyncExternalStore} from 'react'
import usePocketIdentity from './usePocketIdentity'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {registerPocketRefreshHandler} from '../lib/pocketRefresh'
import {pocketBscBalanceCache as cache} from '../lib/pocketBscBalanceCache'


export default function usePocketBscBalances(){
 const identity=usePocketIdentity(),owner=identity.authenticated&&identity.user?.id?JSON.stringify([identity.user.id,identity.user.linkedAccounts.filter(a=>a.type==='wallet'&&a.walletClientType==='privy').map(a=>a.type==='wallet'?a.address.toLowerCase():'').sort()]):''
 const latest=useRef({identity,owner});latest.current={identity,owner}
 const subscribe=useCallback((notify:()=>void)=>cache.subscribe(owner,notify),[owner])
 const read=useCallback(()=>cache.read(owner),[owner])
 const active=useSyncExternalStore(subscribe,read,read)
 const load=useCallback(async(force=false)=>{
  if(!owner||document.visibilityState==='hidden')return
  return cache.load(owner,async()=>{
   const token=await latest.current.identity.getAccessToken();if(!token||latest.current.owner!==owner)throw Error('Sign in again')
   const r=await fetch(pocketApiUrl('/api/pocket/bsc-account'),{headers:{authorization:'Bearer '+token},cache:'no-store',signal:AbortSignal.timeout(15000)}),b=await r.json()
   if(latest.current.owner!==owner)throw Error('Wallet changed')
   const accounts=latest.current.identity.user?.linkedAccounts.filter(a=>a.type==='wallet'&&a.chainType==='ethereum'&&a.walletClientType==='privy')||[]
   if(!r.ok||!b.ok||b.network!=='bsc'||!Array.isArray(b.rows)||b.rows.length!==3||!Number.isFinite(b.observedAt)||b.observedAt>Date.now()+5000||Date.now()-b.observedAt>60000)throw Error('Balances unavailable')
   if(b.address===null?accounts.length!==0:!accounts.some(a=>a.type==='wallet'&&a.address.toLowerCase()===String(b.address).toLowerCase()))throw Error('Wallet changed')
   for(let i=0;i<3;i++)if(b.rows[i].symbol!==['BNB','USDC','USDT'][i]||!Number.isFinite(b.rows[i].quantity)||b.rows[i].quantity<0||!Number.isFinite(b.rows[i].valueUsd)||b.rows[i].valueUsd<0)throw Error('Invalid balance')
   return b
  },force)
 },[owner])
 const refresh=useCallback(()=>load(true),[load])
 useEffect(()=>{
  if(!owner)return
  const tick=()=>{void load()};tick()
  const timer=window.setInterval(tick,45000),unregister=registerPocketRefreshHandler(refresh)
  window.addEventListener('online',tick);document.addEventListener('visibilitychange',tick)
  return()=>{clearInterval(timer);unregister();window.removeEventListener('online',tick);document.removeEventListener('visibilitychange',tick)}
 },[owner,load,refresh])
 const snapshot=owner?active.snapshot:undefined
 const holdings=['BNB','USDC','USDT'].map(symbol=>{const row=snapshot?.rows.find(r=>r.symbol===symbol);return {id:'bsc:'+symbol,symbol,icon:symbol==='BNB'?'/brand/bnb.svg':symbol==='USDC'?'/brand/usdc-circle-logo.png':'/brand/usdt.svg',network:'BNB Chain',networkIcon:'/brand/bnb.svg',quantity:row?.quantity??0,valueUsd:!owner?0:row?.valueUsd??null,known:!owner||!!row,stale:!!active.error,valueLoading:!!active.busy}})
 return {address:snapshot?.address,holdings,complete:!owner||!!snapshot,unavailable:!!owner&&active.error,busy:!!owner&&active.busy,total:holdings.reduce((sum,r)=>sum+(r.valueUsd??0),0),refresh}
}
