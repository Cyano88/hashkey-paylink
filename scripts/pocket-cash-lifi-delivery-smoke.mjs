import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {lifiDelivery} from '../api/pocket/lifi-outbound-bridge.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
const owner='0x'+'1'.repeat(40),recipient='0x'+'2'.repeat(40),sender='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),out='0x'+'b'.repeat(64),id='0x'+'c'.repeat(64),sourceToken='0x779ded0c9e1022225f8e0630b35a9b54be713736'
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
for(const destination of ['base','arbitrum','ethereum','polygon']){
 const target=POCKET_USDT_ASSETS[destination],units=9007199254740993n,p={destination,owner,recipient,amountUnits:String(units),minimumUnits:'1',transactionId:id}
 const status={status:'DONE',substatus:'COMPLETED',transactionId:id,fromAddress:owner,toAddress:recipient,tool:'layerswap',sending:{txHash:hash,chainId:196,token:{address:sourceToken}},receiving:{txHash:out,chainId:target.chainId,token:{address:target.address}}}
 const receipt={status:'success',transactionHash:out,logs:[{address:target.address,data:encodeAbiParameters(parseAbiParameters('uint256'),[units]),topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:sender,to:recipient}})}]}
 const fetcher=async()=>({ok:true,json:async()=>status})
 const result=await lifiDelivery(p,hash,async()=>receipt,fetcher)
 assert.equal(result.status,'completed');assert.equal(result.cashReceivedAmount,'9007199254.740993')
 assert.equal((await lifiDelivery(p,hash,async()=>null,fetcher)).cashReceivedAmount,undefined)
 receipt.logs[0].removed=true;assert.equal((await lifiDelivery(p,hash,async()=>receipt,fetcher)).cashReceivedAmount,undefined)
}
console.log('PASS LI.FI exact received Cash amount across Base, Arbitrum, Ethereum and Polygon; missing or invalid receipts never provide an amount. Synthetic canonical receipt fixtures.')
