import {readCircleKitTransaction} from './circle-bridge-transaction.js'
import {createHash} from 'node:crypto'
import {hasRenderDurableStore} from '../render-durable-store.js'
import {readCircleKitActionStore,mutateCircleKitActionStore} from '../circle-pocket-action-journal.js'
import {consumePocketPaymentApproval} from './payment-security.js'
import {revalidateCrossBridgeWallets} from './cross-bridge-wallets.js'
import {createCircleKitOperations,type CircleKitOperationStore} from './circle-bridge-operations.js'
import {openCircleKitReview,type CircleKitReview} from './circle-bridge-review.js'

type ProviderInput={chain:CircleKitReview['input']['source'];userToken:string;walletId:string;walletAddress:string;refId:string}
type Runtime={durable():boolean;read(key:string):Promise<CircleKitOperationStore|undefined>;mutate(key:string,fn:(s:CircleKitOperationStore|undefined)=>CircleKitOperationStore):Promise<unknown>;approve:typeof consumePocketPaymentApproval;wallets:typeof revalidateCrossBridgeWallets;open:typeof openCircleKitReview;now():number;dispatch(input:ProviderInput&{callData:string;idempotencyKey:string}):Promise<{challengeId?:string}>;recover(input:ProviderInput):Promise<string|null>;transaction(input:ProviderInput&{challengeId:string;callData:string}):Promise<string|null>}
const defaults:Runtime={durable:hasRenderDurableStore,read:readCircleKitActionStore,mutate:mutateCircleKitActionStore,approve:consumePocketPaymentApproval,wallets:revalidateCrossBridgeWallets,open:openCircleKitReview,now:Date.now,
 dispatch:async input=>(await import('../circle-solana-email.js')).createCircleGasStationEvmChallenge(input),
 recover:async input=>(await import('../circle-solana-email.js')).recoverCircleNativeSendChallenge(input),
 transaction:async input=>{const {circleMigrationRequest}=await import('../circle-solana-email.js');const blockchain={base:'BASE',arbitrum:'ARB',ethereum:'ETH',polygon:'MATIC',arc:'ARC'}[input.chain];return readCircleKitTransaction({...input,blockchain},path=>circleMigrationRequest(input.userToken,input.chain,path))}}
const unavailable=():never=>{throw Object.assign(Error('Bridge recovery storage is unavailable.'),{status:503})}
/** Server-only. ownerId must come from authenticated identity, not request JSON.
 * preflight MUST check current balance, exact-batch fee coverage and wallet policy.
 * Default storage atomically excludes journaled send/swap/bridge reservations.
 * Older dispatch paths and destination settlement still need integration before
 * any endpoint may expose this controller. */
export function createCircleKitRuntime(ownerId:string,preflight:(quote:CircleKitReview)=>Promise<void>,overrides:Partial<Runtime>={}){
 if(!ownerId||ownerId.length>256||typeof preflight!=='function')throw Error('Authenticated bridge context is required.')
 const d={...defaults,...overrides},key='pocket:circle-kit-operations:v1:'+createHash('sha256').update(ownerId).digest('hex')
 const ready=()=>{if(!d.durable())unavailable()}
 const owner=(value:string)=>{if(value!==ownerId)throw Object.assign(Error('Bridge owner mismatch.'),{status:403});ready()}
 const providerInput=(q:CircleKitReview,userToken:string):ProviderInput=>({chain:q.input.source,userToken,walletId:q.wallets.source.walletId,walletAddress:q.wallets.source.address,refId:'pocket:bridge:'+q.id})
 const validate=async(q:CircleKitReview)=>{owner(q.ownerId);await d.wallets(q.wallets)}
 const service=createCircleKitOperations({now:d.now,
  open:async(token,id,recovery)=>{owner(id);return d.open(token,id,{recovery,now:d.now()})},
  read:async()=>{ready();return d.read(key)},mutate:async fn=>{ready();return d.mutate(key,fn)},
  approve:async(id,approval)=>{owner(id);return d.approve(approval,id,d.now())},
  preflight:async q=>{await validate(q);await preflight(q)},
  dispatch:async(q,userToken)=>{await validate(q);const result=await d.dispatch({...providerInput(q,userToken),callData:q.callData,idempotencyKey:q.id});if(!result.challengeId)throw Error('Wallet confirmation is still being recovered.');return {challengeId:result.challengeId}},
  recover:async(op,userToken)=>{await validate(op.quote);const binding=providerInput(op.quote,userToken),challengeId=op.challengeId||await d.recover(binding);if(!challengeId)return null;const txHash=await d.transaction({...binding,challengeId,callData:op.quote.callData});return {challengeId,...(txHash?{txHash}:{})}},
 })
 // Scope every method, including reads/cancellation that do not reopen a quote.
 return {
  prepare:(token:string,id:string,approval:string)=>{owner(id);return service.prepare(token,id,approval)},
  submit:(id:string,who:string,token:string)=>{owner(who);return service.submit(id,who,token)},
  resume:(id:string,who:string,token:string)=>{owner(who);return service.resume(id,who,token)},
  cancel:(id:string,who:string)=>{owner(who);return service.cancel(id,who)},
  read:(id:string,who:string)=>{owner(who);return service.read(id,who)},
 }
}
