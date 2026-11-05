import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {proveCrossBridgeCircleSource} from '../api/pocket/cross-bridge-circle-source.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {crossBridgeDeliveryCandidate,crossBridgeDeliveryProven} from '../api/pocket/cross-bridge-evidence.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
for(const network of ['ethereum','base','arbitrum','polygon']){
const {input,envelope,now}=JSON.parse(readFileSync(new URL(network==='polygon'?'./fixtures/cross-bridge-native-pol.json':'./fixtures/cross-bridge-native-eurc-'+network+'.json',import.meta.url),'utf8'))
const route=validateCrossBridgeRelayQuote(envelope,input,now,null),treasury='0x3333333333333333333333333333333333333333',hash='0x'+'1'.repeat(64)
assert.equal(route.tokenIn.symbol,network==='polygon'?'POL':'ETH');assert.equal(route.conversion.bridgeToken.symbol,'USDC');assert.equal(route.execution.calls.length,5)
for(const changed of [{amountUnits:'1'},{sender:treasury},{source:network==='base'?'ethereum':'base'},{from:'USDC'}])assert.throws(()=>validateCrossBridgeRelayQuote(envelope,{...input,...changed},now,null))
assert.throws(()=>validateCrossBridgeRelayQuote(envelope,input,now+60000,null))
const wallets={ownerId:'fixture',source:{network:input.source,provider:'circle',address:input.sender,walletId:'source'},destination:{network:input.destination,provider:'circle',address:input.recipient,walletId:'destination'}}
const charged=await buildCrossBridgeChargedPlan(route,wallets,123n,treasury)
assert.equal(charged.plan.calls.length,6,'one native reimbursement, no duplicate standalone swap fee')
wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
const secret='combined-eurc-fixture-'.repeat(3),saved=await createCrossBridgeReview({wallets,input,providerQuote:envelope,appFee:null,reimbursementUnits:123n,reimbursementRecipient:treasury,...charged,expiresAt:now+30000},{secret,now})
const review=await openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now})
await assert.rejects(openCrossBridgeReview(saved.quoteToken,'other',{secret,now}))
await assert.rejects(openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now:now+60000}))
assert.ok(await openCrossBridgeReview(saved.quoteToken,'fixture',{secret,now:now+60000,recovery:true}),'expired reviews remain recoverable without rebuilding a new swap')
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const log=(address,from,to,value)=>({address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value]),removed:false})
const receipt={status:'success',transactionHash:hash,logs:[log(route.conversion.bridgeToken.address,input.sender,RELAY_BSC_CHAINS[input.source].depository,BigInt(route.conversion.minimumUnits))]}
const trace={type:'CALL',to:input.sender,input:charged.plan.callData,calls:charged.plan.calls.map(c=>({type:'CALL',from:input.sender,to:c.target,input:c.data,value:'0x'+c.value.toString(16)}))}
assert.equal(proveCrossBridgeCircleSource(review,hash,receipt,trace).sourceConfirmed,true)
const outputHash='0x'+'2'.repeat(64),plan={route,sender:input.sender,recipient:input.recipient},status={status:'refund',originChainId:RELAY_BSC_CHAINS[input.source].id,inTxHashes:[hash],txHashes:[outputHash]}
const option=route.refundOptions.find(o=>o.network===input.source)
assert.equal(option.asset,'USDC')
const request={id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'refund',user:input.sender,recipient:input.recipient,data:{inTxs:[{txHash:hash,chainId:status.originChainId,status:'success'}],outTxs:[{txHash:outputHash,chainId:status.originChainId,status:'success'}],refundCurrencyData:{currency:{chainId:status.originChainId,address:option.address,decimals:option.decimals},amount:route.conversion.minimumUnits}}}
const candidate=crossBridgeDeliveryCandidate(plan,hash,status,{requests:[request]});assert(candidate);assert.equal(candidate.token.symbol,'USDC');assert(crossBridgeDeliveryProven(candidate,BigInt(route.conversion.minimumUnits)));assert(!crossBridgeDeliveryProven(candidate,null))
request.data.refundCurrencyData.amount=String(BigInt(route.conversion.minimumUnits)+1n);assert.equal(crossBridgeDeliveryCandidate(plan,hash,status,{requests:[request]}),null)

for(const mutate of [r=>r.logs.pop(),r=>r.logs[0].data=encodeAbiParameters([{type:'uint256'}],[1n]),r=>r.logs[0].removed=true,r=>r.logs.push(r.logs[0]),r=>r.status='reverted']){const bad=structuredClone(receipt);mutate(bad);assert.throws(()=>proveCrossBridgeCircleSource(review,hash,bad,trace))}
for(const mutate of [t=>t.calls.pop(),t=>t.calls[2].input='0x',t=>t.calls[2].error='reverted',t=>t.calls.push(t.calls[0])]){const bad=structuredClone(trace);mutate(bad);assert.throws(()=>proveCrossBridgeCircleSource(review,hash,receipt,bad))}
}
console.log('PASS combined native ETH and POL conversion validation: exact swap and USDC deposit, single ETH fee, altered/missing/reverted effects rejected; synthetic evidence only')
