import {encodeFunctionData,parseAbi,type Address,type Hex} from 'viem'
import {prepareGiftFunding} from '../../../src/pocket/features/gifts/pocketGiftFunding.js'
import {GIFT_ESCROW_ABI} from '../../../src/pocket/features/gifts/pocketGiftFunding.js'
import {GiftError,type GiftAttempt,type GiftRecord} from './types.js'
const batch=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
export function giftWalletCall(record:GiftRecord,kind:'funding'|'claim'|'refund',attempt:GiftAttempt){
 let calls:{target:Address;value:bigint;data:Hex}[]
 if(kind==='funding'){
  const plan=prepareGiftFunding({sender:record.senderAddress,escrow:record.deployment.escrow,token:record.deployment.token,claimSigner:record.claimSigner,salt:record.salt,amount:record.amount,expiresAt:BigInt(record.expiresAt),now:BigInt(Math.floor(Date.now()/1000))})
  calls=[{target:plan.approval.to,value:0n,data:plan.approval.data},{target:plan.funding.to,value:0n,data:plan.funding.data}]
 }else if(kind==='refund'){
  calls=[{target:record.deployment.escrow,value:0n,data:encodeFunctionData({abi:GIFT_ESCROW_ABI,functionName:'refundExpired',args:[record.giftId]})}]
 }else{
  if(!attempt.signature||!attempt.deadline)throw new GiftError(409,'Prepare your gift claim again.')
  calls=[{target:record.deployment.escrow,value:0n,data:encodeFunctionData({abi:GIFT_ESCROW_ABI,functionName:'claim',args:[record.giftId,attempt.walletAddress,BigInt(attempt.deadline),attempt.signature]})}]
 }
 return encodeFunctionData({abi:batch,functionName:'executeBatch',args:[calls]})
}
export async function giftCircleChallenge(input:{record:GiftRecord;kind:'funding'|'claim'|'refund';attempt:GiftAttempt;userToken:string;walletId:string}){
 if(!input.userToken||input.userToken.length>8000)throw new GiftError(401,'Reconnect your Pocket wallet.')
 const {createCircleGasStationEvmChallenge}=await import('../../circle-solana-email.js')
 const data=await createCircleGasStationEvmChallenge({chain:input.record.deployment.network,userToken:input.userToken,walletId:input.walletId,walletAddress:input.attempt.walletAddress,callData:giftWalletCall(input.record,input.kind,input.attempt),refId:'pocket-gift:'+input.record.id+':'+input.kind,idempotencyKey:input.attempt.id})
 if(!data.challengeId)throw new GiftError(503,'Wallet approval is not available yet. Try again.')
 return {challengeId:data.challengeId,transactionId:data.transactionId||data.id||''}
}
