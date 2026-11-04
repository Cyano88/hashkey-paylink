import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'
import {listCrossBridgeOperations,crossBridgeResponse} from './cross-bridge-runtime.js'
import type {CrossBridgeOperation} from './cross-bridge-operations.js'
export async function crossBridgeActivityRow(op:CrossBridgeOperation):Promise<PocketActivityRow|undefined>{
 if(['prepared','cancelled','not_submitted'].includes(op.state))return
 const data=await crossBridgeResponse(op),q=data.quote
 return {eventId:'pocket-cross-bridge:'+op.id,providerReference:op.id,txHash:op.sourceHash||'',chain:q.source,payer:q.walletAddress,recipient:q.destinationAddress,amount:q.amount,assetSymbol:q.asset,feeAmount:q.fee,ts:op.createdAt,statusUpdatedAt:op.updatedAt,source:'wallet-bridge',settlementType:'wallet_bridge',direction:'out',destination:q.destination,destinationAsset:q.destinationAsset,memo:q.asset+' to '+q.destinationAsset,contextLabel:q.source+' to '+q.destination,activityLabel:'Bridge',paycrestStatus:data.status==='completed'?'completed':data.status==='refunded'?'refunded':data.status==='failed'?'failed':'processing',destinationTxHash:data.destinationTxHash,...(data.amountOut?{receivedAmount:data.amountOut}:{}),...(data.refundTxHash?{refundTxHash:data.refundTxHash,refundAsset:data.refundAsset,refundAmount:data.refundAmount,refundNetwork:data.refundNetwork}:{})}
}
export async function readCrossBridgeActivity(owner:string){
 const rows=await Promise.all((await listCrossBridgeOperations(owner)).map(crossBridgeActivityRow))
 return rows.filter((r):r is PocketActivityRow=>Boolean(r))
}
