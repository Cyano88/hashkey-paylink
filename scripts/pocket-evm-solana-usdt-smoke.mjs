import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Keypair} from '@solana/web3.js'
import {encodeAbiParameters,encodeEventTopics} from 'viem'
import {RELAY_DEPOSIT_EVENT,relayUsdtDepositMatches,readEvmSolanaUsdtDelivery,quoteEvmSolanaUsdt} from '../api/pocket/evm-solana-usdt-bridge.ts'
import {RELAY_USDT_CHAINS} from '../api/pocket/usdt-relay-provider.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
import {reconcileUsdtBridge} from '../api/pocket/usdt-bridge.ts'
import {sealUsdtBridgeQuote,USDT_TRANSFER_ABI} from '../api/pocket/usdt-bridge-provider.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='test-only-evm-solana-bridge-secret-32-characters'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/relay-usdt/relay-arbitrum-solana.json',import.meta.url),'utf8'))
const realNow=Date.now;process.env.RELAY_API_KEY='test-key'
try{
 Date.now=()=>(fixture.response.protocol.v2.orderData.output.deadline-7*86400)*1000
 const quoted=await quoteEvmSolanaUsdt({ownerId:'owner',walletId:'wallet',walletAddress:fixture.request.user,destinationAddress:fixture.request.recipient,source:'arbitrum',amount:'100'},async()=>({ok:true,json:async()=>fixture.response}))
 assert.equal(quoted.destinationAddress,fixture.request.recipient);assert.equal(quoted.provider,'relay');assert.equal(quoted.destination,'solana');assert.equal(quoted.requestId,fixture.response.steps.find(s=>s.id==='deposit').requestId)
 await assert.rejects(()=>quoteEvmSolanaUsdt({...quoted,source:'polygon'}))
}finally{Date.now=realNow}
const wallet='0x'+'11'.repeat(20),hash='0x'+'22'.repeat(32),order='0x'+'33'.repeat(32),requestId='0x'+'44'.repeat(32),outHash='3'.repeat(88),recipient=Keypair.generate().publicKey.toBase58()
const q={id:'relay-test',ownerId:'owner',walletId:'wallet',walletAddress:wallet,destinationAddress:recipient,source:'arbitrum',destination:'solana',provider:'relay',requestId,transactionId:order,amount:'1',amountUnits:'1000000',receive:'0.78',minimumReceive:'0.775',minimumUnits:'775000',fee:'0.223',networkFeeUnits:'3000',totalUnits:'1003000',total:'1.003',reimbursementTreasury:EVM_PLATFORM_TREASURY,expiresAt:Date.now()-1000,callData:'0x'}
const deposit={address:RELAY_USDT_CHAINS.arbitrum.depository,topics:encodeEventTopics({abi:RELAY_DEPOSIT_EVENT,eventName:'RelayErc20Deposit'}),data:encodeAbiParameters(RELAY_DEPOSIT_EVENT[0].inputs,[wallet,POCKET_USDT_ASSETS.arbitrum.address,1000000n,order])}
assert.equal(relayUsdtDepositMatches(q,[deposit]),true)
for(const altered of [{...q,transactionId:hash},{...q,amountUnits:'2'},{...q,walletAddress:'0x'+'55'.repeat(20)}])assert.equal(relayUsdtDepositMatches(altered,[deposit]),false)
assert.equal(relayUsdtDepositMatches(q,[deposit,deposit]),false)
assert.equal(relayUsdtDepositMatches(q,[{...deposit,removed:true}]),false)
const status={status:'success',originChainId:42161,destinationChainId:792703809,inTxHashes:[hash],txHashes:[outHash]}
const request={id:requestId,protocol:{orderId:order,hubType:'onchain'},status:'success',user:wallet,recipient,data:{inTxs:[{txHash:hash,chainId:42161,status:'success'}],outTxs:[{txHash:outHash,chainId:792703809,status:'success'}]}}
let s,r,received
const reset=()=>{s=structuredClone(status);r=structuredClone(request);received=780000n}
const deliveryDeps={apiKey:'test-key',fetch:async url=>({ok:true,json:async()=>url.includes('/requests/')?{requests:[r]}:s}),received:async(network,h,address)=>{assert.equal(network,'solana');assert.equal(h,outHash);assert.equal(address,recipient);return received}}
reset();assert.equal((await readEvmSolanaUsdtDelivery(q,hash,deliveryDeps)).status,'completed')
for(const mutate of [()=>r.recipient=wallet,()=>r.protocol.orderId=hash,()=>r.id=hash,()=>s.inTxHashes=[order],()=>s.originChainId=8453,()=>r.data.outTxs.push(r.data.outTxs[0]),()=>received=1n]){reset();mutate();assert.equal((await readEvmSolanaUsdtDelivery(q,hash,deliveryDeps)).status,'needs_attention')}
reset();received=null;assert.equal((await readEvmSolanaUsdtDelivery(q,hash,deliveryDeps)).status,'pending')
reset();s.status=r.status='refund';received=500000n;r.data.refundCurrencyData={amount:'500000',currency:{chainId:792703809,address:POCKET_USDT_ASSETS.solana.address,decimals:6}};assert.equal((await readEvmSolanaUsdtDelivery(q,hash,deliveryDeps)).status,'refunded')
r.data.refundCurrencyData.currency.address=wallet;assert.equal((await readEvmSolanaUsdtDelivery(q,hash,deliveryDeps)).status,'needs_attention')
const transfer=(to,amount)=>({address:POCKET_USDT_ASSETS.arbitrum.address,topics:encodeEventTopics({abi:USDT_TRANSFER_ABI,eventName:'Transfer',args:{from:wallet,to}}),data:encodeAbiParameters([{type:'uint256'}],[amount])})
const receipt={status:'success',blockNumber:1n,blockHash:hash,logs:[deposit,transfer(RELAY_USDT_CHAINS.arbitrum.depository,1000000n),transfer(EVM_PLATFORM_TREASURY,3000n)]}
const token=sealUsdtBridgeQuote(q),initial={id:'record',status:'submitted',metadata:{quoteToken:token},updatedAt:Date.now()}
let stored,ledger=[],deliveryStatus='completed'
const recovery={findAction:async()=>stored,recordAction:async value=>(stored={...stored,...value}),appendLedger:async value=>ledger.push(value),readActivity:async()=>[{assetSymbol:'USDT',direction:'out',ts:Date.now(),txHash:hash}],client:()=>({getTransactionReceipt:async()=>receipt,getChainId:async()=>42161,getBlock:async()=>({hash})}),relayDelivery:async()=>({status:deliveryStatus,settlement:{network:'solana',transactionHash:outHash,amountUnits:'780000'}})}
stored=structuredClone(initial);assert.equal((await reconcileUsdtBridge('owner',token,{},recovery)).status,'completed');assert.equal(ledger[0].settlementNetwork,'solana');assert.equal(stored.metadata.provider,'relay')
await reconcileUsdtBridge('owner',token,{},recovery);assert.equal(ledger.length,2)
stored=structuredClone(initial);deliveryStatus='refunded';assert.equal((await reconcileUsdtBridge('owner',token,{txHash:hash},recovery)).status,'refunded');assert.equal(ledger.at(-1).state,'refunded')
stored=structuredClone(initial);receipt.logs.pop();assert.equal((await reconcileUsdtBridge('owner',token,{txHash:hash},recovery)).status,'needs_attention')
await assert.rejects(()=>reconcileUsdtBridge('different-owner',token,{},recovery))
console.log('PASS Arbitrum-to-Solana order/debit proof, destination/refund binding, missing hash recovery, fee reimbursement, owner isolation and terminal ledger recovery. No live transaction.')
