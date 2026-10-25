import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {resolveBscOutboundWallets} from '../api/pocket/bsc-outbound-wallets.ts'
import {validateBscRelayQuote,bscBridgeTokenAddress} from '../api/pocket/bsc-bridge-provider.ts'
import {validateBscOutbound,bscOutboundCalls} from '../src/pocket/lib/pocketBscOutboundBridge.ts'
import {bscBridgeDeliveryCandidate,bscBridgeDeliveryProven,evmStablecoinDelta} from '../api/pocket/bsc-bridge-evidence.ts'
import {createBscBridgeOperations} from '../api/pocket/bsc-bridge-operations.ts'
const owner='0xd7579fa0784288ef6eab335bc97d3c8ebc7ec435',other='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),outHash='0x'+'b'.repeat(64),userOp='0x'+'c'.repeat(64)
const wallet={type:'wallet',chainType:'ethereum',walletClientType:'privy',id:'fixturewallet123',address:owner}
let circleReads=0
const deps={user:async id=>{assert.equal(id,'owner');return{linkedAccounts:[wallet,{...wallet,walletClientType:'metamask',address:other}]}},circle:async()=>{circleReads++;return{circleWalletAddress:other}}}
const resolved=await resolveBscOutboundWallets('owner','xlayer',deps)
assert.equal(resolved.destinationAddress.toLowerCase(),owner);assert.equal(circleReads,0)
await resolveBscOutboundWallets('owner','base',deps);assert.equal(circleReads,1)
for(const linkedAccounts of [[],[wallet,wallet],[{...wallet,address:'0x'+'0'.repeat(40)}]])await assert.rejects(()=>resolveBscOutboundWallets('owner','xlayer',{...deps,user:async()=>({linkedAccounts})}))
for(const asset of ['USDC','USDT']){
 const {input,now,response}=JSON.parse(readFileSync('scripts/fixtures/reverse-bridge/'+asset+'-bsc-xlayer.json','utf8'))
 if(asset==='USDT')assert.throws(()=>validateBscRelayQuote(response,input,now),/refund mismatch/)
 const route=validateBscRelayQuote(response,input,now,{allowXLayerUsdcRefund:true})
 const q={...resolved,version:1,id:randomUUID(),source:'bsc',destination:'xlayer',asset,from:asset,amountUnits:input.amountUnits,receiveUnits:route.receiveUnits,minimumOutUnits:route.minimumUnits,reimbursementUnits:'1000000000000',totalInputUnits:String(BigInt(input.amountUnits)+1000000000000n),orderId:route.orderId,requestId:route.requestId,refundOptions:route.refundOptions,issuedAt:now,expiresAt:route.expiresAt}
 validateBscOutbound(q,now);assert.equal(bscOutboundCalls(q,now).length,5)
 for(const mutate of [x=>x.refundOptions[1].recipient=other,x=>x.refundOptions[0].asset='BNB',x=>x.refundOptions[1].network='base',x=>x.refundOptions.push(x.refundOptions[0]),x=>x.purpose='cash']){const bad=structuredClone(q);mutate(bad);assert.throws(()=>validateBscOutbound(bad,now))}
 const binding={...input,orderId:q.orderId,requestId:q.requestId,minimumUnits:q.minimumOutUnits,refundOptions:q.refundOptions}
 const status={status:'refund',originChainId:56,inTxHashes:[hash],txHashes:[outHash]}
 const requests={requests:[{id:q.requestId,status:'refund',user:owner,recipient:owner,protocol:{orderId:q.orderId,hubType:'onchain'},data:{inTxs:[{txHash:hash,chainId:56,status:'success'}],outTxs:[{txHash:outHash,chainId:196,status:'success'}],refundCurrencyData:{currency:{chainId:196,address:bscBridgeTokenAddress('xlayer','USDC'),decimals:6},amount:'9000000'}}}]}
 const candidate=bscBridgeDeliveryCandidate(binding,hash,status,requests);assert.equal(candidate.status,'verify_delivery');assert.equal(candidate.asset,'USDC');assert.equal(candidate.outcome,'refunded')
 const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),receipt={status:'success',transactionHash:outHash,logs:[{address:bscBridgeTokenAddress('xlayer','USDC'),topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:other,to:owner}}),data:encodeAbiParameters([{type:'uint256'}],[9000000n])}]}
 assert(bscBridgeDeliveryProven(candidate,evmStablecoinDelta(receipt,'xlayer',candidate.asset,owner,outHash)));assert(!bscBridgeDeliveryProven(candidate,8999999n));assert(!bscBridgeDeliveryProven(candidate,null))
 if(asset==='USDT'){const missing={...binding};delete missing.refundOptions;assert.notEqual(bscBridgeDeliveryCandidate(missing,hash,status,requests).status,'verify_delivery')}
 let store,sendCount=0
 const ops=createBscBridgeOperations({appId:'fixture',now:()=>now,read:async()=>store,mutate:async fn=>{store=fn(structuredClone(store));return store},approve:async()=>true,preflight:async()=>{},send:async()=>{sendCount++;return{ok:true,status:200,body:{data:{hash,transaction_id:'transaction123456',user_operation_hash:userOp,caip2:'eip155:56'}}}},transaction:async id=>({id,wallet_id:q.walletId,caip2:'eip155:56',transaction_hash:hash,user_operation_hash:userOp}),settle:async()=>({status:'refunded',refundAsset:'USDC',refundAmount:'9',refundNetwork:'xlayer',destinationTxHash:outHash})})
 await ops.prepare(q,'approval');await ops.submit(q.id,q,'signature');const finished=await ops.status(q.id,q);assert.equal(finished.state,'refunded');assert.equal(finished.refundAsset,'USDC');assert.equal(sendCount,1)
 console.log('PASS '+asset+' BNB -> X Layer wallet binding, 18-to-6 decimals, signed refund plan, exact USDC refund and durable refund asset')
}
