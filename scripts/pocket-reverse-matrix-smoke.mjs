import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {randomUUID} from 'node:crypto'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {validateBscRelayQuote,RELAY_BSC_CHAINS,bscBridgeTokenAddress} from '../api/pocket/bsc-bridge-provider.ts'
import {bscBridgeDeliveryCandidate,bscBridgeDeliveryProven} from '../api/pocket/bsc-bridge-evidence.ts'
import {validateBscOutbound,bscOutboundCalls} from '../src/pocket/lib/pocketBscOutboundBridge.ts'
import {validateRelayStablecoinQuote,stablecoinAddress,RELAY_STABLECOIN_CHAINS} from '../api/pocket/xlayer-bridge-provider.ts'
import {createXLayerOutboundBridge,outboundBridgePreview,sealOutboundBridge,openOutboundBridge} from '../api/pocket/xlayer-outbound-bridge.ts'
import {validateOutboundBridge} from '../src/pocket/api/pocketOutboundBridge.ts'
import {makeSponsoredBatchRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {solanaBridgeTokenDelta} from '../api/pocket/bridge-solana-delivery.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-reverse-matrix-secret-only'
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),solana='5tAUpyEjHsKN2CLXduUVTDHmTC4zWAbgGSWiL7XVippA'
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),depositAbi=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
for(const file of readdirSync('scripts/fixtures/reverse-bridge')){
 const {input,now,response}=JSON.parse(readFileSync('scripts/fixtures/reverse-bridge/'+file,'utf8')), {source,destination,asset}=input
 const route=source==='bsc'?validateBscRelayQuote(response,input,now):validateRelayStablecoinQuote(response,input,now)
 const outHash=destination==='solana'?'3'.repeat(88):'0x'+'c'.repeat(64)
 if(source==='bsc'){
  const q={version:1,id:randomUUID(),ownerId:'owner',walletId:'fixturewallet123',walletAddress:input.sender,destinationAddress:input.recipient,source,destination,asset,from:asset,amountUnits:input.amountUnits,receiveUnits:route.receiveUnits,minimumOutUnits:route.minimumUnits,reimbursementUnits:'1000000000000',totalInputUnits:String(BigInt(input.amountUnits)+1000000000000n),orderId:route.orderId,requestId:route.requestId,issuedAt:now,expiresAt:route.expiresAt}
  validateBscOutbound(q,now);assert.equal(bscOutboundCalls(q,now).length,5)
  assert.throws(()=>validateBscOutbound({...q,destinationAddress:destination==='solana'?input.sender:solana},now))
  if(destination!=='base')assert.throws(()=>validateBscOutbound({...q,purpose:'cash'},now))
  const status={status:'success',originChainId:56,destinationChainId:RELAY_BSC_CHAINS[destination].id,inTxHashes:[hash],txHashes:[outHash]}
  const requests={requests:[{id:q.requestId,status:'success',user:input.sender,recipient:input.recipient,protocol:{orderId:q.orderId,hubType:'onchain'},data:{inTxs:[{txHash:hash,chainId:56,status:'success'}],outTxs:[{txHash:outHash,chainId:RELAY_BSC_CHAINS[destination].id,status:'success'}]}}]}
  const binding={...input,minimumUnits:route.minimumUnits,orderId:q.orderId,requestId:q.requestId}
  const candidate=bscBridgeDeliveryCandidate(binding,hash,status,requests);assert.equal(candidate.status,'verify_delivery');assert(bscBridgeDeliveryProven(candidate,BigInt(route.receiveUnits)));assert(!bscBridgeDeliveryProven(candidate,null));assert(!bscBridgeDeliveryProven(candidate,BigInt(route.minimumUnits)-1n))
  requests.requests[0].recipient=destination==='solana'?input.recipient.toLowerCase():'0x'+'1'.repeat(40);assert.notEqual(bscBridgeDeliveryCandidate(binding,hash,status,requests).status,'verify_delivery')
 }else if(asset==='USDC'){
  let missing=false,wrongWallet=false,delta=BigInt(route.receiveUnits)
  const log=(network,from,to,amount)=>({address:stablecoinAddress(network,asset),topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[amount])})
  const depository=RELAY_STABLECOIN_CHAINS.xlayer.depository
  const sourceReceipt={status:'success',transactionHash:hash,blockHash,blockNumber:1n,logs:[log(source,input.sender,depository,BigInt(input.amountUnits)),log(source,input.sender,EVM_PLATFORM_TREASURY,125n),{address:depository,topics:encodeEventTopics({abi:depositAbi,eventName:'RelayErc20Deposit'}),data:encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint256'},{type:'bytes32'}],[input.sender,stablecoinAddress(source,asset),BigInt(input.amountUnits),route.orderId])}]}
  const status={status:'success',originChainId:196,destinationChainId:RELAY_STABLECOIN_CHAINS[destination].id,inTxHashes:[hash],txHashes:[outHash]}
  const requests={requests:[{id:route.requestId,status:'success',user:input.sender,recipient:input.recipient,protocol:{orderId:route.orderId,hubType:'onchain'},data:{inTxs:[{txHash:hash,chainId:196,status:'success'}],outTxs:[{txHash:outHash,chainId:RELAY_STABLECOIN_CHAINS[destination].id,status:'success'}]}}]}
  const service=createXLayerOutboundBridge({now:()=>now,apiKey:()=>'fixture',destination:async(_,n)=>{assert.equal(n,destination);return{id:'circlewallet',address:wrongWallet?'wrong':input.recipient}},route:async i=>{assert.deepEqual(i,input);return route},client:n=>{assert.notEqual(n,'solana');return{readContract:async()=>1000000000n,getChainId:async()=>RELAY_STABLECOIN_CHAINS[n].id,getTransactionReceipt:async()=>{if(n==='xlayer')return sourceReceipt;if(missing)throw Error('not mined');return{status:'success',transactionHash:outHash,blockHash,blockNumber:1n,logs:[log(n,depository,input.recipient,delta)]}},getBlock:async()=>({hash:blockHash})}},solanaDelivery:async(a,r,h)=>{assert.equal(a,asset);assert.equal(r,input.recipient);assert.equal(h,outHash);return missing?null:delta},fetch:async url=>Response.json(url.includes('/intents/status')?status:requests)})
  const estimate=async()=>({feeUnits:'100',expiresAt:now+25000,estimateId:'fixture'}),q=await service.quote({ownerId:'owner',walletId:'fixturewallet123',walletAddress:input.sender,asset,amount:'10',destination},estimate,{marginBps:2500,minimumFeeUnits:'0'})
  assert.deepEqual(openOutboundBridge(sealOutboundBridge(q),'owner'),q);await service.preflight(q,estimate)
  const preview=outboundBridgePreview(q),review={quote:preview,quoteToken:'fixture',request:makeSponsoredBatchRequest({appId:'fixture',walletId:'fixturewallet123',attemptId:preview.id,expiresAt:preview.expiresAt,calls:q.fee.calls})}
  validateOutboundBridge(review,input.sender,input.recipient,asset,'10',now)
  assert.equal((await service.status(q,hash)).status,'completed');missing=true;assert.notEqual((await service.status(q,hash)).status,'completed');missing=false;delta=0n;assert.notEqual((await service.status(q,hash)).status,'completed');wrongWallet=true;await assert.rejects(()=>service.preflight(q,estimate))
 }
 if(destination==='solana'){
  const row={accountIndex:1,owner:input.recipient,mint:bscBridgeTokenAddress('solana',asset),uiTokenAmount:{decimals:6,amount:route.receiveUnits}},tx={transaction:{signatures:[outHash]},meta:{err:null,preTokenBalances:[],postTokenBalances:[row]}}
  assert.equal(solanaBridgeTokenDelta(tx,asset,input.recipient,outHash),BigInt(route.receiveUnits));assert.equal(solanaBridgeTokenDelta(tx,asset,input.recipient.toLowerCase(),outHash),0n);tx.meta.postTokenBalances.push(row);assert.equal(solanaBridgeTokenDelta(tx,asset,input.recipient,outHash),null)
 }
 console.log('PASS '+source+' -> '+destination+' '+asset)
}
// Converted USDT must preserve exact Solana recipient in the client and sealed recovery quote.
const converted=JSON.parse(readFileSync('scripts/fixtures/relay-xlayer/USDT-converted-outbound.json','utf8'))
converted.destination='solana';converted.destinationAddress=solana;converted.refundOptions=converted.refundOptions.map(r=>r.network==='base'?{...r,network:'solana',recipient:solana}:r)
assert.deepEqual(openOutboundBridge(sealOutboundBridge(converted),converted.fee.ownerId),converted)
const preview=outboundBridgePreview(converted),review={quote:preview,quoteToken:'fixture',request:makeSponsoredBatchRequest({appId:'fixture',walletId:converted.fee.walletId,attemptId:preview.id,expiresAt:preview.expiresAt,calls:converted.fee.calls})}
validateOutboundBridge(review,converted.fee.walletAddress,solana,'USDT','1',converted.fee.issuedAt)
assert.throws(()=>validateOutboundBridge(review,converted.fee.walletAddress,solana.toLowerCase(),'USDT','1',converted.fee.issuedAt))
console.log('PASS Solana converted USDT recipient binding; no funds moved')
