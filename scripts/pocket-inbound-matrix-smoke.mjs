import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {encodeAbiParameters,encodeEventTopics,parseAbi,parseAbiParameters} from 'viem'
import {Keypair,Transaction} from '@solana/web3.js'
import {SOLANA_TOKEN_PROGRAM_ID} from '../api/solana-token.ts'
import {createBscInboundBridgeHandler} from '../api/pocket/bsc-inbound-bridge.ts'
import {createXLayerBridgeHandler} from '../api/pocket/xlayer-bridge.ts'
import {bscBridgeTokenAddress,validateBscRelayQuote,RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
import {validateRelayStablecoinQuote} from '../api/pocket/xlayer-bridge-provider.ts'
import {quoteEvmBridgeFee} from '../api/pocket/evm-bridge-reimbursement.ts'
import {prepareSolanaUsdtRelayTransaction} from '../api/pocket/solana-usdt-relay-transaction.ts'
import {reconcileSolanaExternalBridge} from '../api/pocket/solana-external-bridge-settlement.ts'
import {createSolanaUsdtBridgeState} from '../api/pocket/solana-usdt-bridge-state.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='synthetic-inbound-secret-not-production-12345'
const sourceHash='0x'+'a'.repeat(64),destHash='0x'+'b'.repeat(64),blockHash='0x'+'c'.repeat(64)
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']),deposit=parseAbi(['event RelayErc20Deposit(address from,address token,uint256 amount,bytes32 id)'])
let count=0
for(const file of readdirSync('scripts/fixtures/inbound-bridge').filter(n=>n.endsWith('.json'))){
 const {input:i,response,now}=JSON.parse(readFileSync('scripts/fixtures/inbound-bridge/'+file,'utf8'))
 const q=i.destination==='bsc'?validateBscRelayQuote(response,i,now):validateRelayStablecoinQuote(response,i,now,{allowXLayerUsdcRefund:true})
 if(i.source==='solana'){
  const relayer=Keypair.generate(),treasury=Keypair.generate().publicKey
  const rpc={getAccountInfo:async()=>({owner:SOLANA_TOKEN_PROGRAM_ID}),getTokenAccountBalance:async()=>({value:{amount:'1000000000'}}),getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:100}),getFeeForMessage:async()=>({value:10000}),getBalance:async()=>1000000000}
  const prepared=await prepareSolanaUsdtRelayTransaction({quote:response,route:i,connection:rpc,relayer,treasury,now,readRate:async()=>100n*100000000n})
  assert.equal(prepared.asset,i.asset);assert.equal(prepared.destination,i.destination);assert.equal(prepared.totalUnits,'10001000')
  const tx=Transaction.from(Buffer.from(prepared.transaction,'base64'));assert.equal(tx.verifySignatures(false),true);assert.equal(tx.signatures[1].publicKey.toBase58(),i.sender)
  assert.equal(tx.instructions[1].keys[1].pubkey.toBase58(),bscBridgeTokenAddress('solana',i.asset))
  assert.equal(BigInt(prepared.providerFeeUnits),BigInt(i.amountUnits)-BigInt(q.receiveUnits)/(i.destination==='bsc'?10n**12n:1n))
  const approvals=new Map();let started=0
  const state=createSolanaUsdtBridgeState({read:async id=>approvals.get(id),update:async(id,fn)=>{const r=fn(approvals.get(id));approvals.set(id,r);return r}},()=>now)
  const saved=await state.register({ownerId:'owner',walletId:'wallet',walletAddress:i.sender,destinationAddress:i.recipient,quote:prepared})
  const authorization={ownerId:'owner',id:saved.id,walletId:'wallet',walletAddress:i.sender,rawTransaction:prepared.transaction}
  await state.authorize(authorization,async()=>{started++;return 'challenge'})
  await state.authorize(authorization,async()=>{started++;return 'another'})
  assert.equal(started,1);await assert.rejects(()=>state.read('other',saved.id),/not found/)
  let record={id:'test',ownerId:'owner',walletAddress:i.sender,destinationAddress:i.recipient,quote:prepared,signature:'3'.repeat(88),phase:'source_confirmed'},received=null,ledger=0
  const sourceId=RELAY_BSC_CHAINS.solana.id,destId=RELAY_BSC_CHAINS[i.destination].id
  const status={status:'success',originChainId:sourceId,destinationChainId:destId,inTxHashes:[record.signature],txHashes:[destHash]}
  const request={id:q.requestId,protocol:{orderId:q.orderId,hubType:'onchain'},status:'success',user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:record.signature,chainId:sourceId,status:'success'}],outTxs:[{txHash:destHash,chainId:destId,status:'success'}]}}
  let expectedNetwork=i.destination,expectedAsset=i.asset
  const deps={store:{read:async()=>record,update:async(_id,fn)=>record=fn(record)},apiKey:()=> 'fixture',now:()=>now,ledger:async()=>{ledger++},received:async(network,asset)=>{assert.equal(network,expectedNetwork);assert.equal(asset,expectedAsset);return received},fetch:async url=>({ok:true,json:async()=>url.includes('/intents/')?status:{requests:[request]}})}
  assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'pending');assert.equal(ledger,0)
  received=1n;assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'needs_attention')
  received=BigInt(q.receiveUnits);request.recipient='0x'+'1'.repeat(40);assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'needs_attention');request.recipient=i.recipient
  assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'completed');assert.equal(record.settlement.amountUnits,q.receiveUnits);assert.equal(ledger,1)
  await assert.rejects(()=>reconcileSolanaExternalBridge('other','test',deps),/not found/)
  for(const refund of prepared.refundOptions){
   record={...record,phase:'source_confirmed',settlement:undefined};expectedNetwork=refund.network;expectedAsset=refund.asset
   const refundHash=refund.network==='solana'?'4'.repeat(88):destHash,refundId=RELAY_BSC_CHAINS[refund.network].id
   received=5000000n*(refund.network==='bsc'?10n**12n:1n)
   status.status='refund';status.txHashes=[refundHash];request.status='refund'
   request.data.outTxs=[{chainId:refundId,txHash:refundHash,status:'success'}]
   request.data.refundCurrencyData={currency:{chainId:refundId,address:bscBridgeTokenAddress(refund.network,refund.asset),decimals:refund.network==='bsc'?18:6},amount:String(received)}
   assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'refunded');assert.equal(record.settlement.asset,refund.asset)
  }
 }else{
  const records=new Map(),receipts=new Map();let sends=0,providerStatus='pending',walletSource
  const log=(network,from,to,units)=>({address:bscBridgeTokenAddress(network,i.asset),data:encodeAbiParameters(parseAbiParameters('uint256'),[units]),topics:encodeEventTopics({abi:transfer,eventName:'Transfer',args:{from,to}})})
  const rpc=network=>({getChainId:async()=>RELAY_BSC_CHAINS[network].id,readContract:async()=>1000000000n,call:async()=>{},getBlockNumber:async()=>100n,getBlock:async()=>({hash:blockHash}),getTransactionReceipt:async({hash})=>{if(!receipts.has(hash))throw Error('not found');return receipts.get(hash)}})
  const handler=(i.destination==='bsc'?createBscInboundBridgeHandler:createXLayerBridgeHandler)({identity:async()=>({userId:'owner'}),wallets:async(_owner,source)=>{walletSource=source;return {walletId:'wallet-'+source,walletAddress:i.sender,destinationAddress:i.recipient}},now:()=>now,enabled:async()=>true,usdtEnabled:()=>true,client:rpc,apiKey:()=> 'fixture',quote:async input=>{assert.deepEqual(input,i);return q},price:input=>quoteEvmBridgeFee(input,async()=> '0.000001',3000n*100000000n,now),find:async(_o,key)=>records.get(key),list:async()=>[],claim:async input=>{if(records.has(input.idempotencyKey))return {claimed:false};records.set(input.idempotencyKey,{...input,id:'journal',status:'started',updatedAt:now});return {claimed:true}},record:async input=>{records.set(input.idempotencyKey,{...records.get(input.idempotencyKey),...input,updatedAt:now})},challenge:async input=>{assert.equal(input.chain,i.source);assert.equal(input.walletId,'wallet-'+i.source);sends++;return {challengeId:'challenge'}},readChallenge:async input=>{assert.equal(input.chain,i.source);return {status:'awaiting_approval'}},activity:async()=>[],ledger:async()=>{},fetch:async url=>({ok:true,json:async()=>url.includes('/intents/')?{status:providerStatus,originChainId:RELAY_BSC_CHAINS[i.source].id,destinationChainId:RELAY_BSC_CHAINS[i.destination].id,inTxHashes:[sourceHash],txHashes:[destHash]}:{requests:[{id:q.requestId,protocol:{orderId:q.orderId,hubType:'onchain'},status:providerStatus,user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:sourceHash,chainId:RELAY_BSC_CHAINS[i.source].id,status:'success'}],outTxs:[{txHash:destHash,chainId:RELAY_BSC_CHAINS[i.destination].id,status:'success'}]}}]}})})
  const call=async(body,duplicate=false)=>{let code=200,result;await handler({method:'POST',body},{setHeader(){},status(n){code=n;return this},json(v){result=v;return this}});assert.ok(code===200||duplicate&&code===409,JSON.stringify(result));return result}
  const quote=await call({action:'quote',source:i.source,destination:i.destination,asset:i.asset,amount:'10',circleUserToken:'fixture'})
  assert.equal(quote.quote.source,i.source);assert.equal(walletSource,i.source)
  await Promise.all([call({action:'execute',quoteToken:quote.quoteToken,circleUserToken:'fixture'},true),call({action:'execute',quoteToken:quote.quoteToken,circleUserToken:'fixture'},true)]);assert.equal(sends,1)
  const body={action:'status',quoteToken:quote.quoteToken,circleUserToken:'fixture'}
  assert.equal((await call(body)).status,'awaiting_approval')
  const dep={address:RELAY_BSC_CHAINS[i.source].depository,data:encodeAbiParameters(parseAbiParameters('address,address,uint256,bytes32'),[i.sender,bscBridgeTokenAddress(i.source,i.asset),10000000n,q.orderId]),topics:encodeEventTopics({abi:deposit,eventName:'RelayErc20Deposit'})}
  receipts.set(sourceHash,{status:'success',transactionHash:sourceHash,blockHash,blockNumber:1n,logs:[log(i.source,i.sender,RELAY_BSC_CHAINS[i.source].depository,10000000n),log(i.source,i.sender,EVM_PLATFORM_TREASURY,3000n),dep]})
  body.txHash=sourceHash;providerStatus='success';assert.equal((await call(body)).status,'pending')
  receipts.set(destHash,{status:'success',transactionHash:destHash,blockHash,blockNumber:1n,logs:[log(i.destination,RELAY_BSC_CHAINS[i.destination].depository,i.recipient,BigInt(q.receiveUnits))]})
  assert.equal((await call(body)).status,'completed')
 }
 count++;console.log('PASS '+file)
}
assert.equal(count,22);console.log('PASS 22 inbound routes: validated provider fixtures, source signing, fee units, duplicate protection, and verified delivery. No funds moved.')
