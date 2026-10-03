import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {verifyArcTradeReceipt,createArcTradeReceiptRecorder} from '../api/trade-agreement/receipt.ts'
import {client,reset,release,binding,buyer,seller,escrow,usdc} from './arc-trade-test-fixture.mjs'
const hash='0x'+'dd'.repeat(32),blockHash='0x'+'aa'.repeat(32),evidence='0x'+'cc'.repeat(32),project='dev_fixture12345'
const record={id:'tag_'+'a'.repeat(64),partnerId:project,binding,terms:{title:'Synthetic item'},evidence:[]}
const settleAbi=parseAbi(['event Settled(bytes32 indexed offerId,uint256 buyerAmount,uint256 sellerAmount,bytes32 evidence,uint8 state)']),transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
let patch={}
function receipt(){
 const base={transactionHash:hash,blockHash,blockNumber:90n,removed:false}
 const logs=[{...base,address:escrow,logIndex:2,topics:encodeEventTopics({abi:settleAbi,eventName:'Settled',args:{offerId:patch.offerId??binding.contractTerms.offerId}}),data:encodeAbiParameters(parseAbiParameters('uint256,uint256,bytes32,uint8'),[patch.buyerAmount??500000n,patch.sellerAmount??750000n,evidence,patch.state??8])},
 ...[[buyer,500000n],[seller,750000n]].map(([to,value],i)=>({...base,address:patch.token??usdc,logIndex:i,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:escrow,to}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[patch.transferAmount??value])}))]
 if(patch.removed)logs[0].removed=true;if(patch.duplicate)logs.push(logs[0]);if(patch.missingTransfer)logs.pop();if(patch.badLog)logs[0].transactionHash=evidence
 return {transactionHash:hash,blockHash:patch.blockHash??blockHash,blockNumber:patch.blockNumber??90n,status:patch.status??'success',logs}
}
const reader={...client,getTransactionReceipt:async()=>receipt()}
reset({state:8});const good=await verifyArcTradeReceipt(record,hash,reader,release)
assert.equal(good.chainId,5042);assert.equal(good.buyerAmountUnits,'500000');assert.equal(good.sellerAmountUnits,'750000');assert.equal(good.termsHash,binding.termsHash);assert.equal(good.blockNumber,'90')
for(const change of [{buyerAmount:1n},{sellerAmount:1n},{state:6},{offerId:evidence},{token:buyer},{transferAmount:1n},{removed:true},{duplicate:true},{missingTransfer:true},{badLog:true},{blockHash:evidence},{blockNumber:96n},{status:'reverted'}]){patch=change;reset({state:8});await assert.rejects(()=>verifyArcTradeReceipt(record,hash,reader,release),undefined,Object.keys(change).join())}
patch={};for(const change of [{state:5},{state:8,chain:196},{state:8,reorg:true},{state:8,latestState:5}]){reset(change);await assert.rejects(()=>verifyArcTradeReceipt(record,hash,reader,release))}
reset({state:8});let stored=structuredClone(record)
const save=createArcTradeReceiptRecorder({release:()=>release,reader:()=>reader,mutate:async(key,fn)=>{assert.equal(key,'hashpaylink:arc-hosted-trade:v1:'+record.id);stored=fn(stored);return stored}})
assert.deepEqual(await save(record,hash),good);assert.deepEqual(await save(record,hash),good)
stored={...stored,receipt:{...good,buyerAmountUnits:'1'}};await assert.rejects(()=>save(record,hash),/different settlement/)
stored={...record,partnerId:'dev_wrong12345'};await assert.rejects(()=>save(record,hash),/Agreement changed/)
await assert.rejects(()=>createArcTradeReceiptRecorder({release:()=>null})(record,hash),/pending verification/)
reset({state:7});patch={state:7,buyerAmount:1250000n,sellerAmount:0n}
const refundReceipt=receipt()
refundReceipt.logs=refundReceipt.logs.slice(0,2)
refundReceipt.logs[1].data=encodeAbiParameters(parseAbiParameters('uint256'),[1250000n])
const refundReader={...client,getTransactionReceipt:async()=>refundReceipt}
const refund=await verifyArcTradeReceipt(record,hash,refundReader,release)
assert.equal(refund.state,7);assert.equal(refund.buyerAmountUnits,'1250000');assert.equal(refund.sellerAmountUnits,'0')
refundReceipt.logs[1].topics=encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:escrow,to:seller}})
await assert.rejects(()=>verifyArcTradeReceipt(record,hash,refundReader,release),/USDC transfers/)
console.log('Arc receipts passed: canonical terminal event, exact USDC payouts and full buyer refund, wrong refund recipient, failed/unconfirmed/foreign/reorg rejection, immutable storage and project binding.')
