import {pocketCashDelivery} from '../../src/pocket/lib/pocketCashDelivery.js'
import {pocketBridgeResultPresentation} from '../../src/pocket/lib/pocketBridgeResultPresentation.js'
import type {PocketActivityRow} from '../../src/pocket/lib/pocketSchemas.js'
import {listCrossBridgeOperations,crossBridgeResponse} from './cross-bridge-runtime.js'
import type {CrossBridgeOperation} from './cross-bridge-operations.js'
export async function crossBridgeActivityRow(op:CrossBridgeOperation):Promise<PocketActivityRow|undefined>{
 if(['prepared','cancelled','not_submitted'].includes(op.state))return
 const data=await crossBridgeResponse(op),q=data.quote
 const exchangeVisible=pocketBridgeResultPresentation({state:data.status,txHash:data.txHash,deliveryObserved:!!data.destinationTxHash&&data.deliveryObserved,deliveryConfirmed:!!data.destinationTxHash&&data.deliveryConfirmed}).activityState
 const cashFunding=q.purpose==='cash'&&q.destination==='base'
 const credit=pocketCashDelivery(q,data,data.status)
 const visible=cashFunding?(credit?'completed':data.status):exchangeVisible
 return {...(cashFunding?{cashFunding:true}:{}),eventId:'pocket-cross-bridge:'+op.id,providerReference:op.id,txHash:op.sourceHash||'',chain:q.source,payer:q.walletAddress,recipient:q.destinationAddress,amount:q.amount,assetSymbol:q.asset,feeAmount:q.fee,ts:op.createdAt,statusUpdatedAt:op.updatedAt,source:'wallet-bridge',settlementType:'wallet_bridge',direction:'out',destination:q.destination,destinationAsset:q.destinationAsset,memo:cashFunding?'Added to Cash balance':q.asset+' to '+q.destinationAsset,contextLabel:cashFunding?'Cash balance':q.asset+' to '+q.destinationAsset,activityLabel:cashFunding?'Cash funding':'Bridge',bridgeSettlementPending:!credit&&visible==='completed'&&data.status!=='completed',paycrestStatus:visible==='completed'?'completed':data.status==='refunded'?'refunded':data.status==='failed'?'failed':'processing',destinationTxHash:data.destinationTxHash,...(data.amountOut?{receivedAmount:data.amountOut,...(cashFunding?{cashReceivedAmount:data.amountOut}:{})}:{}),...(data.refundTxHash?{refundTxHash:data.refundTxHash,refundAsset:data.refundAsset,refundAmount:data.refundAmount,refundNetwork:data.refundNetwork}:{})}
}
export async function readCrossBridgeActivity(owner:string){
 const rows=await Promise.all((await listCrossBridgeOperations(owner)).map(crossBridgeActivityRow))
 return rows.filter((r):r is PocketActivityRow=>Boolean(r))
}
