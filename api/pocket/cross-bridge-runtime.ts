import {formatUnits,type Hex} from 'viem'
import {readManualBridgeRetry,retryScope} from './cross-bridge-manual-retry.js'
import {readDurableJson,mutateDurableJson} from '../render-durable-store.js'
import {crossBridgeJournalKey,crossBridgeReservationStore} from './cross-bridge-reservation.js'
import type {CrossBridgeJournal} from './cross-bridge-reservation-guard.js'
import {openCrossBridgeReview} from './cross-bridge-review.js'
import {createCrossBridgeCircleSettlement} from './cross-bridge-circle-settlement.js'
import {readCrossBridgeCircleSourceState} from './cross-bridge-circle-source.js'
import {readCrossBridgePrivySource} from './cross-bridge-privy-source.js'
import {readCrossBridgeSolanaSource} from './cross-bridge-solana-source.js'
import {createCrossBridgeCircleRuntime} from './cross-bridge-circle-runtime.js'
import {createCrossBridgePrivyRuntime} from './cross-bridge-privy-runtime.js'
import {createCrossBridgeSolanaRuntime} from './cross-bridge-solana-runtime.js'
import {crossBridgePreflight} from './cross-bridge-quote.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {sumPrivyTransactionGas} from './privy-transaction-gas.js'
import {checkXLayerBillingCoverage} from './xlayer-billing-guard.js'
import {crossBridgeSelectionKey} from '../../src/pocket/lib/pocketCrossBridgeSelection.js'
import type {CrossBridgeOperation} from './cross-bridge-operations.js'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
export async function listCrossBridgeOperations(owner:string){const journal=await readDurableJson<CrossBridgeJournal>(crossBridgeJournalKey());return Object.values(journal?.crossBridge??{}).filter(r=>r.ownerId===owner&&typeof r.quoteToken==='string').sort((a,b)=>Number(b.updatedAt)-Number(a.updatedAt)) as CrossBridgeOperation[]}
export function crossBridgePreview(r:Review){const q=r.quote,i=q.input,route=r.route;return {...(route.conversion?{conversion:{from:i.from,via:'USDC' as const}}:{}),id:q.id,rail:'cross',execution:q.wallets.source.provider,selectionKey:crossBridgeSelectionKey(i),source:i.source,destination:i.destination,asset:i.from,destinationAsset:i.to,walletAddress:i.sender,destinationAddress:i.recipient,amount:formatUnits(BigInt(i.amountUnits),route.tokenIn.decimals),receive:formatUnits(BigInt(route.receiveUnits),route.tokenOut.decimals),minimumReceive:formatUnits(BigInt(route.minimumUnits),route.tokenOut.decimals),fee:formatUnits(BigInt(q.reimbursementUnits),route.tokenIn.decimals),total:formatUnits(BigInt(q.totalUnits),route.tokenIn.decimals),expiresAt:q.expiresAt}}
export type CrossBridgeResponse={ok:boolean;quote:ReturnType<typeof crossBridgePreview>;quoteToken:string;status:string;deliveryObserved?:boolean;deliveryConfirmed?:boolean;challengeId?:string;txHash?:string;destinationTxHash?:string;amountOut?:string;refundAsset?:string;refundAmount?:string;refundNetwork?:string;refundTxHash?:string}
export async function crossBridgeResponse(op:CrossBridgeOperation):Promise<CrossBridgeResponse>{
 const review=await openCrossBridgeReview(op.quoteToken,op.ownerId,{recovery:true}),settlement=op.settlement as any,delivery=op.delivery as any
 return {ok:true,quote:crossBridgePreview(review),quoteToken:op.quoteToken,status:op.state==='source_failed'?'failed':op.state==='prepared'?'prepared':op.state==='source_confirmed'?'pending':op.state,challengeId:op.challengeId,txHash:op.sourceHash,...(op.observedDelivery&&['submitted','source_confirmed'].includes(op.state)&&Date.now()-(op.observedDelivery as any).observedAt<120_000?{deliveryObserved:true,destinationTxHash:(op.observedDelivery as any).hash,amountOut:formatUnits(BigInt((op.observedDelivery as any).amountUnits),(op.observedDelivery as any).token.decimals)}:{}),...(delivery&&['submitted','source_confirmed'].includes(op.state)?{deliveryConfirmed:true,destinationTxHash:delivery.hash,amountOut:formatUnits(BigInt(delivery.amountUnits),delivery.token.decimals)}:{}),...(settlement?{destinationTxHash:settlement.hash,...(op.state==='completed'?{amountOut:formatUnits(BigInt(settlement.amountUnits),settlement.token.decimals)}:op.state==='refunded'?{refundAsset:settlement.token.symbol,refundAmount:formatUnits(BigInt(settlement.amountUnits),settlement.token.decimals),refundNetwork:settlement.network,refundTxHash:settlement.hash}:{})}:{})}
}
export const reconcileCrossBridge=createCrossBridgeCircleSettlement({overrides:{source:async(record,review)=>{
 const op=await crossBridgeReservationStore.read(record.id)
 if(!op||op.ownerId!==record.ownerId||op.sourceHash!==record.sourceHash)throw Error('Bridge source identity changed.')
 if(review.quote.input.source==='solana'){
  if(typeof op.solanaTransaction!=='string'||typeof op.signedTransaction!=='string')throw Error('Bridge signature is still being recovered.')
  return readCrossBridgeSolanaSource(review,record.sourceHash,op.solanaTransaction,op.signedTransaction)
 }
 if(review.quote.wallets.source.provider==='privy')return readCrossBridgePrivySource(review,record.sourceHash as Hex,op.userOperationHash as Hex|undefined)
 return readCrossBridgeCircleSourceState(review,record.sourceHash)
}}})
export function crossBridgeEnabled(owner:string,env:NodeJS.ProcessEnv=process.env){return env.POCKET_CROSS_BRIDGE_ENABLED==='true'&&(env.POCKET_CROSS_BRIDGE_OWNER_IDS||'').split(',').map(x=>x.trim()).includes(owner)}
/** Uses the existing wallet-wide billing guard plus a transaction-bound ledger
 * for the new routes. Missing invoices/IDs never become invented zero charges. */
export async function crossBridgePolicyGuard(review:Review,env:NodeJS.ProcessEnv=process.env){
 const q=review.quote,source=q.input.source
 if(!crossBridgeEnabled(q.ownerId,env))throw Error('This bridge is not enabled for this account.')
 if(q.wallets.source.provider!=='privy')return
 if(env.POCKET_PRIVY_TRANSACTION_BILLING_ENABLED!=='true'&&env.POCKET_PRIVY_COMBINED_BILLING_ENABLED!=='true')throw Error('Bridge sponsorship billing is unavailable.')
 const manual=await readManualBridgeRetry(retryScope(q))
 await checkXLayerBillingCoverage(q.wallets.source.address,{manualCrossBridgeException:manual?.originalId})
 const haltKey='pocket:cross-bridge-billing-halt:v1:'+source
 if(await readDurableJson(haltKey))throw Error('Bridge sponsorship is paused for fee reconciliation.')
 const ops=(await listCrossBridgeOperations(q.ownerId)).filter(o=>o.id!==q.id&&o.id!==manual?.originalId&&o.source===source&&o.walletAddress.toLowerCase()===q.input.sender.toLowerCase()&&o.createdAt>=Date.now()-28*86400000&&!['prepared','cancelled','not_submitted'].includes(o.state))
 if(!ops.length)return
 if(ops.some(o=>!['completed','refunded','source_failed'].includes(o.state)||!o.transactionId||!o.sourceHash))throw Error('Previous bridge billing is still being verified.')
 const appId=env.PRIVY_APP_ID||env.VITE_PRIVY_APP_ID||'',secret=env.PRIVY_APP_SECRET||''
 const billed=await sumPrivyTransactionGas(ops.map(o=>({transactionId:o.transactionId!,walletId:q.wallets.source.walletId,chainId:source==='bsc'?56:196,hash:o.sourceHash as Hex})),async id=>{const r=await fetch('https://api.privy.io/v1/transactions/'+encodeURIComponent(id),{headers:{'privy-app-id':appId,Authorization:'Basic '+Buffer.from(appId+':'+secret).toString('base64')},redirect:'error',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Bridge billing is unavailable.');return r.json()})
 let coverage=0n
 for(const op of ops.filter(o=>o.state!=='source_failed')){const saved=await openCrossBridgeReview(op.quoteToken,q.ownerId,{recovery:true}),prices=await readCrossBridgePrices(saved.quote.input.source,saved.quote.input.from);coverage+=BigInt(saved.quote.reimbursementUnits)*prices.assetPrice.scaled8*95n/(10n**BigInt(saved.route.tokenIn.decimals)*100n*100n)}
 if(billed>coverage){await mutateDurableJson(haltKey,old=>old||{at:Date.now(),billedUsdMicros:String(billed),coverageUsdMicros:String(coverage)});throw Error('Bridge sponsorship is paused for fee reconciliation.')}
}
export function crossBridgeRuntime(review:Review,userToken:string,options:{reuseEstimateMs?:number}={}){
 const owner=review.quote.ownerId,preflight=crossBridgePreflight(userToken,crossBridgePolicyGuard,process.env,{},options.reuseEstimateMs)
 // This shared preflight freshly validates both wallets on every invocation.
 // Avoid a second sequential lookup in the wrapper; dispatch checks remain.
 const validation={preflightRevalidatesWallets:true}
 if(review.quote.input.source==='solana')return createCrossBridgeSolanaRuntime(owner,userToken,preflight,validation)
 if(review.quote.wallets.source.provider==='privy')return createCrossBridgePrivyRuntime(owner,preflight,validation)
 return createCrossBridgeCircleRuntime(owner,userToken,preflight,validation)
}
