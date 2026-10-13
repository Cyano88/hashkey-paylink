import {useEffect,useRef} from 'react'
import {connectFreshEvmSession} from '../controllers/usePocketWalletController'
import {pocketOperationExecuting,migratePocketOperations,readPocketOperations,trackPocketOperation,POCKET_OPERATIONS_UPDATED} from '../lib/pocketOperationRecovery'
import {pocketApiUrl} from '../lib/pocketRoutes'
import {prefetchPocketActivity} from './usePocketActivity'

/** Read saved operations globally. This worker never opens wallet approval. */
export default function usePocketOperationRecovery(input:{authenticated:boolean;email:string;getAccessToken():Promise<string|null>}) {
 const latest=useRef(input);latest.current=input
 useEffect(()=>{
  if(!input.authenticated||!input.email)return
  const owner=input.email;let disposed=false,running=false
  const valid=()=>!disposed&&latest.current.email===owner&&latest.current.authenticated
  const check=async()=>{
   if(running||!valid()||document.visibilityState==='hidden')return
   running=true
   try{
    migratePocketOperations(owner)
    const token=await latest.current.getAccessToken();if(!token||!valid())return
    let changed=false
    for(const record of readPocketOperations(owner).filter(r=>!['completed','failed','refunded'].includes(r.state))){
     if(!valid())return
     if(pocketOperationExecuting(owner,record.pending.quote.id))continue
     try{
      const p=record.pending,network=record.kind==='bridge'?p.quote.source:'arc'
      const address=p.walletAddress||p.quote.walletAddress
      const session=network==='solana'||!address?null:await connectFreshEvmSession(owner,network,address,latest.current.getAccessToken).catch(()=>null)
      if(!valid())return
      const response=await fetch(pocketApiUrl(record.kind==='bridge'?'/api/pocket/usdt-bridge':'/api/pocket/arc-swap'),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({action:'status',quoteToken:p.quoteToken,txHash:p.txHash,...(session?{circleUserToken:session.userToken}:{})}),signal:AbortSignal.timeout(30000)})
      const result=await response.json();if(!valid())return
      if(!response.ok||!result.ok)continue
      const state=result.status==='completed'?'completed':result.status==='failed'||(result.status==='not_submitted'&&result.reason==='approval_expired')?'failed':result.status==='refunded'?'refunded':result.status==='awaiting_approval'?'awaiting_approval':result.status==='not_submitted'||result.status==='needs_attention'||result.status==='needs_review'?'needs_review':'processing'
      const next={...p,...(result.challengeId?{challengeId:result.challengeId}:{}),...(result.txHash?{txHash:result.txHash}:{}),...(result.destinationTxHash?{destinationTxHash:result.destinationTxHash}:{})}
      if(trackPocketOperation(owner,record.kind,next,state))changed=true
     }catch{/* An unreachable provider is not proof that a payment failed. */}
    }
    if(changed&&valid())void prefetchPocketActivity({email:owner,getAccessToken:latest.current.getAccessToken}).catch(()=>{})
   }catch{/* Retain records when authentication or storage is temporarily unavailable. */}finally{running=false}
  }
  void check();const timer=window.setInterval(check,10000)
  const visible=()=>{if(document.visibilityState==='visible')void check()}
  window.addEventListener('online',visible);document.addEventListener('visibilitychange',visible);window.addEventListener(POCKET_OPERATIONS_UPDATED,visible)
  return()=>{disposed=true;clearInterval(timer);window.removeEventListener('online',visible);document.removeEventListener('visibilitychange',visible);window.removeEventListener(POCKET_OPERATIONS_UPDATED,visible)}
 },[input.authenticated,input.email])
}
