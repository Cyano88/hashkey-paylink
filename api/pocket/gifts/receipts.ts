import {formatUnits} from 'viem'
import type {GiftRecord} from './types.js'
import {recordCirclePocketAction,type CirclePocketActionRecord} from '../../circle-pocket-action-journal.js'
import type {PocketActivityRow} from '../../../src/pocket/models/pocketActivity.js'
export function giftReceiptActions(record:GiftRecord){
 const actions:Parameters<typeof recordCirclePocketAction>[0][]=[]
 if(record.version===2){
  const asset=record.deployment.asset,decimals=asset?.decimals??6;const metadata={network:record.deployment.network,giftId:record.id,...(asset?{assetSymbol:asset.symbol,assetAddress:asset.token,assetDecimals:String(asset.decimals),rail:asset.rail}:{})};
  if(record.fundingHash&&record.fundingAt)actions.push({ownerId:record.ownerId,idempotencyKey:record.id,action:'gift.sent',status:'completed',resourceId:record.id,metadata:{...metadata,amount:record.amount,txHash:record.fundingHash,confirmedAt:String(record.fundingAt),fee:formatUnits(BigInt(record.feeUnits),decimals),walletAddress:record.senderAddress,destination:'Pocket gift',state:record.refundHash?'refunded':record.state==='claimed'?'claimed':'funded',...(record.refundHash?{refundTxHash:record.refundHash,refundAmount:formatUnits(BigInt(record.refundUnits!),decimals)}:{})}});
  for(const [account,settled] of Object.entries(record.settlements||{})){const attempt=record.claims?.[account];if(!attempt||attempt.walletAddress.toLowerCase()!==settled.recipient.toLowerCase())continue;actions.push({ownerId:attempt.userId,idempotencyKey:record.id+':'+account,action:'gift.received',status:'completed',resourceId:record.id,metadata:{...metadata,amount:record.amountPerClaim!,txHash:settled.hash,confirmedAt:String(settled.at),walletAddress:settled.recipient,destination:settled.recipient,sender:record.senderHandle,state:'claimed'}})}
  return actions
 }
 const base={network:record.deployment.network,amount:record.amount,giftId:record.id}
 if(record.fundingHash&&record.fundingAt)actions.push({ownerId:record.ownerId,idempotencyKey:record.id,action:'gift.sent',status:'completed',resourceId:record.id,metadata:{...base,txHash:record.fundingHash,confirmedAt:String(record.fundingAt),fee:formatUnits(BigInt(record.feeUnits),6),walletAddress:record.senderAddress,destination:'Pocket gift',...(record.state==='claimed'&&record.settlementHash&&record.claimRecipient&&record.claim?.walletAddress.toLowerCase()===record.claimRecipient.toLowerCase()?{claimRecipient:record.claimRecipient}:{}),state:record.refundHash?'refunded':record.state==='claimed'&&record.settlementHash?'claimed':'funded',...(record.refundHash?{refundTxHash:record.refundHash}:{})}})
 if(record.state==='claimed'&&record.settlementHash&&record.settlementAt&&record.claimRecipient&&record.claim?.walletAddress.toLowerCase()===record.claimRecipient.toLowerCase())actions.push({ownerId:record.claim.userId,idempotencyKey:record.id,action:'gift.received',status:'completed',resourceId:record.id,metadata:{...base,txHash:record.settlementHash,confirmedAt:String(record.settlementAt),walletAddress:record.claimRecipient,destination:record.claimRecipient,sender:record.senderHandle,state:'claimed'}})
 return actions
}
export async function publishGiftReceipts(record:GiftRecord){for(const action of giftReceiptActions(record))await recordCirclePocketAction(action)}
export function giftActivityRow(record:CirclePocketActionRecord,rail:'stablecoins'|'xstocks'='stablecoins'):PocketActivityRow|undefined{
 if(!['gift.sent','gift.received'].includes(record.action)||record.status!=='completed')return
 const m=record.metadata
 if((m?.rail||'stablecoins')!==rail)return
 if(!m||!/^0x[0-9a-fA-F]{64}$/.test(m.txHash)||!Number.isFinite(Number(m.confirmedAt)))return
 const incoming=record.action==='gift.received'
 return {eventId:'pocket-gift:'+record.id,txHash:m.txHash,refundTxHash:m.refundTxHash,chain:m.network,assetSymbol:m.assetSymbol,amount:m.state==='refunded'&&m.refundAmount?m.refundAmount:m.amount,feeAmount:m.fee,ts:Number(m.confirmedAt),payer:incoming?m.sender:m.walletAddress,recipient:m.destination,destination:m.destination,source:'gift',giftState:['funded','claimed','refunded'].includes(m.state)?m.state as 'funded'|'claimed'|'refunded':undefined,giftRecipient:m.state==='claimed'&&/^0x[0-9a-fA-F]{40}$/.test(m.claimRecipient||'')?m.claimRecipient:undefined,settlementType:'gift',direction:incoming?'in':'out',paycrestStatus:m.state==='refunded'?'refunded':'completed',activityLabel:incoming?'Gift received':m.state==='refunded'?'Gift refunded':'Gift funded',memo:incoming?'Gift received':m.state==='refunded'?(m.refundAmount?m.refundAmount+' '+(m.assetSymbol||'USDC')+' of the original gift was refunded. The creation fee was not refunded.':'Unclaimed gift refunded. The creation fee was not refunded.'):(m.assetSymbol||'USDC')+' funded into a claimable gift.',providerReference:m.giftId}
}
