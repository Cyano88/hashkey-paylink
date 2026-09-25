import { readSolanaRelayStatus, clearConfirmedSolanaRelay } from '../../lib/solanaPaymentFees'
import {confirmPocketAirtime,refreshPocketAirtime} from '../api/pocketBillsClient'
import { useEffect, useRef } from 'react'
import { activePocketEvmSession, activePocketSolanaSession } from '../controllers/usePocketWalletController'
import { readCachedPocketBalance, balanceOwner } from '../lib/pocketBalanceCache'
import { refreshPocketWalletSnapshot } from './usePocketWallets'
import { migrateLegacySends, readSendAttempts, updateSendAttempt } from '../lib/pocketSendAttempts'
import { reconcileCircleEvmEmailWithdraw } from '../../lib/circleEvmEmailWallet'
import { reconcileCircleSolanaTransfer } from '../../lib/circleSolanaEmailWallet'
import { EVM_CLIENTS } from '../../lib/router'
import { prefetchPocketActivity } from './usePocketActivity'
export default function usePocketSendRecovery(input:{authenticated:boolean;email:string;getAccessToken():Promise<string|null>}) {
 const current=useRef(input);current.current=input
 useEffect(()=>{
  if(!input.authenticated||!input.email)return
  const owner=input.email;let cancelled=false,reading=false
  const valid=()=>!cancelled&&current.current.authenticated&&current.current.email===owner
  const check=async()=>{
   if(reading||!valid()||document.visibilityState==='hidden')return
   reading=true
   try{
    migrateLegacySends(owner,readCachedPocketBalance(balanceOwner(owner))?.wallets||{})
    const records=readSendAttempts(owner).filter(r=>!['confirmed','failed'].includes(r.state))
    let changed=false
    for(const r of records){
     if(!valid())return
     try{
      let result:{state:'confirmed'|'submitted';txHash:string|null}|undefined
      if(r.network!=='solana'){
       if(r.txHash){const receipt=await EVM_CLIENTS[r.network].getTransactionReceipt({hash:r.txHash as `0x${string}`});if(!valid())return;updateSendAttempt(owner,r.idempotencyKey,{state:receipt.status==='success'?'confirmed':'failed',error:receipt.status==='success'?'':'Transfer reverted.'});changed=true;continue}
       const session=activePocketEvmSession(owner,r.network,r.sourceAddress)
       if(session&&r.challengeId)result=await reconcileCircleEvmEmailWithdraw({session,challengeId:r.challengeId,transactionId:r.transactionId,timeoutMs:2500})
      }else{
       const hash=r.txHash||(r.challengeId.startsWith('relay:')?r.challengeId.slice(6):'')
       if(hash){const token=await current.current.getAccessToken();if(!valid())return;if(token&&await readSolanaRelayStatus(hash,token,undefined,r.sourceAddress)){if(!valid())return;clearConfirmedSolanaRelay(r.sourceAddress,hash);updateSendAttempt(owner,r.idempotencyKey,{state:'confirmed',txHash:hash});changed=true;continue}}
       const session=activePocketSolanaSession(owner,r.sourceAddress)
       if(session&&r.challengeId){const accessToken=await current.current.getAccessToken();if(!valid())return;result=await reconcileCircleSolanaTransfer({session,accessToken:accessToken||'',challengeId:r.challengeId,transactionId:r.transactionId,timeoutMs:2500})}
      }
      if(!valid())return
      if(result?.state==='confirmed'&&result.txHash){updateSendAttempt(owner,r.idempotencyKey,{state:'confirmed',txHash:result.txHash});changed=true}
     }catch(e){if(!valid())return;if((e as {terminalFailure?:boolean})?.terminalFailure){if(r.network==='solana'){const hash=r.txHash||(r.challengeId.startsWith('relay:')?r.challengeId.slice(6):'');if(hash)clearConfirmedSolanaRelay(r.sourceAddress,hash)}updateSendAttempt(owner,r.idempotencyKey,{state:'failed',error:e instanceof Error?e.message:'Transfer failed.'});changed=true}}
    }
    // Bills retain their own delivery state. Resume existing authorized intents,
    // without opening OTP/PIN or putting a previous purchase back in the form.
    const billPrefix='pocket:bills:owned:'+encodeURIComponent(owner.trim().toLowerCase())+':'
    for(const category of ['airtime','data','tv','electricity']){
      const legacy='pocket:bills:active:'+category
      const saved=JSON.parse(localStorage.getItem(legacy)||'null')
      if(saved?.intentId){try{const token=await current.current.getAccessToken();if(!valid())return;if(token){await refreshPocketAirtime({accessToken:token,intentId:saved.intentId,refresh:false});if(!valid())return;localStorage.setItem(billPrefix+category+':attempt:'+saved.intentId,JSON.stringify(saved));localStorage.removeItem(legacy)}}catch{/* Ownership is checked by the server before migration. */}}
    }
    const billRecords=Object.keys(localStorage).filter(k=>k.startsWith(billPrefix)&&k.includes(':attempt:'))
    for(const key of billRecords){
      if(!valid())return
      try{
        let saved=JSON.parse(localStorage.getItem(key)||'null');if(!saved?.intentId)continue
        const token=await current.current.getAccessToken();if(!valid()||!token)return
        if(!saved.txHash&&saved.challengeId){const session=activePocketEvmSession(owner,'base');if(session){const r=await reconcileCircleEvmEmailWithdraw({session,challengeId:saved.challengeId,transactionId:saved.transactionId,timeoutMs:2500});if(!valid())return;if(r.state==='confirmed'&&r.txHash){saved={...saved,txHash:r.txHash};localStorage.setItem(key,JSON.stringify(saved))}}}
        const next=saved.txHash?await confirmPocketAirtime({accessToken:token,intentId:saved.intentId,txHash:saved.txHash}):await refreshPocketAirtime({accessToken:token,intentId:saved.intentId,refresh:true})
        if(!valid())return
        if(['delivered','failed','refunded'].includes(next.state)){localStorage.removeItem(key);const pointer=key.split(':attempt:')[0];if(JSON.parse(localStorage.getItem(pointer)||'null')?.intentId===saved.intentId)localStorage.removeItem(pointer);changed=true}
      }catch{/* Keep the payment pending when its status service cannot answer. */}
    }
    if(changed&&valid()){void refreshPocketWalletSnapshot({email:owner,getAccessToken:current.current.getAccessToken}).catch(()=>{});void prefetchPocketActivity({email:owner,getAccessToken:current.current.getAccessToken}).catch(()=>{})}
   }catch{/* Keep saved attempts intact when storage/session/provider is unavailable. */}finally{reading=false}
  }
  void check();const timer=window.setInterval(check,20_000);window.addEventListener('focus',check);window.addEventListener('online',check)
  return()=>{cancelled=true;window.clearInterval(timer);window.removeEventListener('focus',check);window.removeEventListener('online',check)}
 },[input.authenticated,input.email])
}
