import {hasRenderDurableStore} from '../render-durable-store.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {revalidateCrossBridgeWallets} from './cross-bridge-wallets.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {createCrossBridgeOperations,type CrossBridgeOperationDependencies} from './cross-bridge-operations.js'
import {readCircleKitTransaction,circleKitApprovalNotSubmitted} from './circle-bridge-transaction.js'

type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
type Chain='ethereum'|'base'|'arbitrum'|'polygon'|'arc'
type Binding={chain:Chain;userToken:string;walletId:string;walletAddress:string;refId:string}
type Dependencies={
 durable():boolean;now():number;open:typeof openCrossBridgeReview;
 wallets:typeof revalidateCrossBridgeWallets;approve:typeof consumePocketPaymentApproval;
 store?:CrossBridgeOperationDependencies['store'];
 dispatch(input:Binding&{callData:string;idempotencyKey:string}):Promise<{challengeId?:string}>;
 recover(input:Binding):Promise<string|null>;
 transaction(input:Binding&{challengeId:string;callData:string}):Promise<string|null>;
 notSubmitted(input:Binding&{challengeId:string}):Promise<boolean>;
}
const defaults:Dependencies={durable:hasRenderDurableStore,now:Date.now,open:openCrossBridgeReview,
 wallets:revalidateCrossBridgeWallets,approve:consumePocketPaymentApproval,
 dispatch:async input=>(await import('../circle-solana-email.js')).createCircleGasStationEvmChallenge(input),
 recover:async input=>(await import('../circle-solana-email.js')).recoverCircleNativeSendChallenge(input),
 notSubmitted:async input=>{const {circleMigrationRequest}=await import('../circle-solana-email.js');return circleKitApprovalNotSubmitted(input.challengeId,path=>circleMigrationRequest(input.userToken,input.chain,path))},
 transaction:async input=>{const {circleMigrationRequest}=await import('../circle-solana-email.js');return readCircleKitTransaction({...input,blockchain:{ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC',arc:'ARC'}[input.chain]},path=>circleMigrationRequest(input.userToken,input.chain,path))},
}
/** Request-scoped Circle authorization is never stored. Status only looks up the
 * original challenge/transaction; it cannot dispatch or open another approval.
 * The supplied preflight must verify the complete charged plan's current cost,
 * source balance and policy. Destination settlement remains a separate proof. */
export function createCrossBridgeCircleRuntime(ownerId:string,userToken:string,preflight:(review:Review)=>Promise<void>,overrides:Partial<Dependencies>={}){
 if(!ownerId||ownerId.length>256||!userToken||userToken.length>8000||typeof preflight!=='function')throw Error('Authenticated bridge wallet context is required.')
 const d={...defaults,...overrides}
 const ready=()=>{if(!d.durable())throw Object.assign(Error('Bridge recovery storage is unavailable.'),{status:503})}
 const binding=(r:Review):Binding=>{
  const q=r.quote,source=q.input.source
  if(q.ownerId!==ownerId||q.wallets.ownerId!==ownerId)throw Object.assign(Error('Bridge owner mismatch.'),{status:403})
  if(!(['ethereum','base','arbitrum','polygon','arc'] as string[]).includes(source)||q.wallets.source.provider!=='circle'||r.charged.plan.kind!=='evm')throw Error('This bridge requires a different wallet provider.')
  return {chain:source as Chain,userToken,walletId:q.wallets.source.walletId,walletAddress:q.wallets.source.address,refId:'pocket:cross-bridge:'+q.id}
 }
 const service=createCrossBridgeOperations({store:d.store,now:d.now,
  open:async(token,owner,recovery)=>{ready();if(owner!==ownerId)throw Error('Bridge owner mismatch.');const r=await d.open(token,owner,{recovery,now:d.now()});binding(r);return r},
  approve:(owner,approval)=>d.approve(approval,owner,d.now()),
  preflight:async r=>{binding(r);await d.wallets(r.quote.wallets);await preflight(r)},
  dispatch:async(r,op,authorization)=>{
   if(authorization!==userToken||op.id!==r.quote.id)throw Error('Bridge authorization changed.')
   await d.wallets(r.quote.wallets)
   if(r.charged.plan.kind!=='evm')throw Error('Invalid Circle bridge plan.')
   const result=await d.dispatch({...binding(r),callData:r.charged.plan.callData,idempotencyKey:op.id})
   return result.challengeId?{challengeId:result.challengeId}:null
  },
  observe:async(r,op)=>{
   await d.wallets(r.quote.wallets)
   const input=binding(r),challengeId=op.challengeId||await d.recover(input)
   if(!challengeId||r.charged.plan.kind!=='evm')return null
   const sourceHash=await d.transaction({...input,challengeId,callData:r.charged.plan.callData})
   if(!sourceHash&&await d.notSubmitted({...input,challengeId}))return {challengeId,approvalNotSubmitted:true}
   return {challengeId,...(sourceHash?{sourceHash}:{})}
  },
 })
 return {
  prepare:(token:string,approval:string)=>{ready();return service.prepare(token,ownerId,approval)},
  submit:(id:string)=>{ready();return service.submit(ownerId,id,userToken)},
  status:(id:string)=>{ready();return service.status(ownerId,id)},
  cancel:(id:string)=>{ready();return service.cancel(ownerId,id)},
  read:(id:string)=>{ready();return service.read(ownerId,id)},
 }
}
