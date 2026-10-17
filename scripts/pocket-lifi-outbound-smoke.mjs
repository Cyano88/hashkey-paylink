import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {decodeFunctionData,encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {lifiAbi,validateLifiPlan,lifiOutboundCalls,LIFI_DIAMOND} from '../src/pocket/lib/pocketLifiOutbound.ts'
import {lifiSourceProven,lifiDelivery} from '../api/pocket/lifi-outbound-bridge.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const token='0x779ded0c9e1022225f8e0630b35a9b54be713736',hash='0x'+'a'.repeat(64),destHash='0x'+'b'.repeat(64)
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const transfer=(from,to,value,address=token)=>({address,data:encodeAbiParameters(parseAbiParameters('uint256'),[value]),topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}})})
for(const destination of ['arbitrum','ethereum','polygon']){
 const b=JSON.parse(readFileSync(new URL('./fixtures/lifi-xlayer/'+destination+'.json',import.meta.url),'utf8')),decoded=decodeFunctionData({abi:lifiAbi,data:b.transactionRequest.data})
 const p={destination,owner:b.action.fromAddress,recipient:b.action.toAddress,amountUnits:b.action.fromAmount,receiveUnits:b.estimate.toAmount,minimumUnits:b.estimate.toAmountMin,transactionId:decoded.args[0].transactionId,data:b.transactionRequest.data,expiresAt:Number(decoded.args[2].deadline)*1000}
 const at=p.expiresAt-1;validateLifiPlan(p,at);assert.equal(lifiOutboundCalls(p,at).length,4)
 for(const patch of [{recipient:EVM_PLATFORM_TREASURY},{owner:EVM_PLATFORM_TREASURY},{destination:'base'},{amountUnits:'1000001'},{minimumUnits:'1'},{data:p.data+'00'},{transactionId:hash}])assert.throws(()=>validateLifiPlan({...p,...patch},at))
 const args=structuredClone(decoded.args);args[1][0].callTo=EVM_PLATFORM_TREASURY
 assert.throws(()=>validateLifiPlan({...p,data:encodeFunctionData({abi:lifiAbi,functionName:decoded.functionName,args})},at),'arbitrary fee/swap contract rejected')
 const event=lifiAbi.find(x=>x.type==='event'),bd=decoded.args[0]
 const receipt={status:'success',transactionHash:hash,logs:[transfer(p.owner,LIFI_DIAMOND,1000000n),transfer(p.owner,EVM_PLATFORM_TREASURY,10000n),{address:LIFI_DIAMOND,data:encodeAbiParameters(event.inputs,[bd]),topics:encodeEventTopics({abi:lifiAbi,eventName:'LiFiTransferStarted'})}]}
 assert(lifiSourceProven(p,'10000',receipt,hash));assert(!lifiSourceProven(p,'10001',receipt,hash))
 assert(!lifiSourceProven(p,'10000',{...receipt,logs:receipt.logs.slice(0,2)},hash))
 const status={status:'DONE',substatus:'COMPLETED',transactionId:p.transactionId,fromAddress:p.owner,toAddress:p.recipient,tool:'layerswap',sending:{txHash:hash,chainId:196,token:{address:token}},receiving:{txHash:destHash,chainId:b.action.toChainId,token:{address:b.action.toToken.address}}}
 const delivered={status:'success',transactionHash:destHash,logs:[transfer(LIFI_DIAMOND,p.recipient,BigInt(p.receiveUnits),b.action.toToken.address)]}
 const fetcher=async()=>({ok:true,json:async()=>status})
 assert.equal((await lifiDelivery(p,hash,async()=>delivered,fetcher)).status,'completed')
 assert.equal((await lifiDelivery(p,hash,async()=>null,fetcher)).status,'pending')
 const batch={...status,fromAddress:EVM_PLATFORM_TREASURY,batchStatus:[structuredClone(status)]}
 assert.equal((await lifiDelivery(p,hash,async()=>delivered,async()=>({ok:true,json:async()=>batch}))).status,'completed','sponsored batch selects the unique owner-bound operation')
 batch.batchStatus.push(structuredClone(status));assert.equal((await lifiDelivery(p,hash,async()=>delivered,async()=>({ok:true,json:async()=>batch}))).status,'needs_attention','ambiguous batch is rejected')
 batch.batchStatus=[{...status,fromAddress:EVM_PLATFORM_TREASURY}];assert.equal((await lifiDelivery(p,hash,async()=>delivered,async()=>({ok:true,json:async()=>batch}))).status,'needs_attention','wrong operation owner rejected')
 status.transactionId=destHash;assert.equal((await lifiDelivery(p,hash,async()=>delivered,fetcher)).status,'needs_attention')
}
console.log('PASS LI.FI three-chain fixed-token calldata, bounded fee, finite approvals, owner/recipient tampering, exact source event/debit/reimbursement, and canonical destination receipt checks. No funds moved.')
