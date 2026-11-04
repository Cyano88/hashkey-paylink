import {encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {readCrossBridgePrivySource} from '../api/pocket/cross-bridge-privy-source.ts'
import {XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
import assert from 'node:assert/strict'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {createCrossBridgePrivyRuntime} from '../api/pocket/cross-bridge-privy-runtime.ts'
import {createCrossBridgePrivyCost} from '../api/pocket/cross-bridge-privy-cost.ts'
const secret='privy-cross-fixture-secret'.repeat(3),treasury='0x3333333333333333333333333333333333333333',sourceHash='0x'+'1'.repeat(64),kernel='0xd6cedde84be40893d153be9d467cd6ad37875b28'
let cases=0
for(const source of ['bsc','xlayer'])for(const asset of crossBridgeAssets(source)){
 const {q,i}=fixture(source,'base',asset.symbol,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:source,provider:'privy',walletId:'fixturewallet1234',address:i.sender},destination:{network:'base',provider:'circle',walletId:'destination',address:i.recipient}}
 wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const charged=await buildCrossBridgeChargedPlan(route,wallets,123n,treasury),saved=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:treasury,...charged,expiresAt:now+30000},{secret,now})
 let time=now,sends=0,proofs=0,rows=new Map(),l1=0
 const rpc=async(method,params)=>{
  if(method==='eth_chainId')return source==='bsc'?'0x38':'0xc4'
  if(method==='eth_getCode')return '0xef0100'+kernel.slice(2)
  if(method==='eth_call'){if(params[0].to==='0x420000000000000000000000000000000000000F'){l1++;return '0x123'}return '0x0'}
  if(method==='eth_estimateUserOperationGas'){assert.equal(params[0].callData,charged.plan.callData);return {callGasLimit:'0x10000',verificationGasLimit:'0x10000',preVerificationGas:'0x10000'}}
  if(method==='rundler_getUserOperationGasPrice')return {blockNumber:'0x10',suggested:{maxFeePerGas:'0x2'}}
  if(method==='eth_gasPrice')return '0x1'
  if(method==='eth_getBlockByNumber')return {number:'0x10',hash:'0x'+'b'.repeat(64),timestamp:'0x'+Math.floor(now/1000).toString(16)}
  throw Error(method)
 }
 const cost=await createCrossBridgePrivyCost(wallets,asset.symbol,{rpc,now:()=>time,prices:async()=>({gasPrice:{scaled8:100000000n,observedAt:now},assetPrice:{scaled8:100000000n,observedAt:now}})})(charged.plan,charged.planHash)
 assert.equal(cost.planHash,charged.planHash);assert.equal(cost.rentUnits,0n);assert.equal(l1,source==='xlayer'?1:0)
 const review=await openCrossBridgeReview(saved.quoteToken,'owner',{secret,now}),blockHash='0x'+'b'.repeat(64),userOpHash='0x'+'c'.repeat(64)
 const op={sender:i.sender,nonce:0n,initCode:'0x',callData:charged.plan.callData,accountGasLimits:'0x'+'0'.repeat(64),preVerificationGas:0n,gasFees:'0x'+'0'.repeat(64),paymasterAndData:'0x',signature:'0x'}
 const txInput=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],i.sender]})
 const events=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)','event Transfer(address indexed from,address indexed to,uint256 value)'])
 const zero='0x'+'0'.repeat(40)
 let success=true,feeDebit=123n
 const sourceRpc=async({method})=>{
  if(method==='eth_chainId')return source==='bsc'?'0x38':'0xc4'
  if(method==='eth_getBlockByNumber')return {number:'0x10',hash:blockHash,transactions:[sourceHash]}
  if(method==='eth_getTransactionByHash')return {hash:sourceHash,to:XLAYER_ENTRY_POINT,input:txInput,chainId:source==='bsc'?'0x38':'0xc4',blockHash,blockNumber:'0x10',transactionIndex:'0x0'}
  if(method==='eth_getTransactionReceipt'){
   const logs=[{address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:events,eventName:'UserOperationEvent',args:{userOpHash,sender:i.sender,paymaster:zero}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[0n,success,0n,1n])}]
   if(!asset.native&&success)for(const [to,value] of [[RELAY_BSC_CHAINS[source].depository,BigInt(i.amountUnits)],[treasury,feeDebit]])logs.push({address:asset.address,topics:encodeEventTopics({abi:events,eventName:'Transfer',args:{from:i.sender,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
   return {status:'0x1',transactionHash:sourceHash,blockHash,blockNumber:'0x10',transactionIndex:'0x0',logs:logs.map((log,index)=>({...log,removed:false,blockHash,blockNumber:'0x10',transactionIndex:'0x0',transactionHash:sourceHash,logIndex:'0x'+index.toString(16)}))}
  }
  throw Error(method)
 }
 assert.equal(await readCrossBridgePrivySource(review,sourceHash,userOpHash,{rpc:sourceRpc}),'confirmed')
 if(!asset.native){feeDebit=122n;await assert.rejects(()=>readCrossBridgePrivySource(review,sourceHash,userOpHash,{rpc:sourceRpc}));feeDebit=123n}
 success=false;assert.equal(await readCrossBridgePrivySource(review,sourceHash,userOpHash,{rpc:sourceRpc}),'failed');success=true
 await assert.rejects(()=>readCrossBridgePrivySource(review,sourceHash,'0x'+'d'.repeat(64),{rpc:sourceRpc}))
 const opts={env:{PRIVY_APP_ID:'fixtureapp',PRIVY_APP_SECRET:'server-secret',RELAY_API_KEY:'relay-key'},fetcher:async(url,init)=>{
  if(url.includes('privy.io')){sends++;const body=JSON.parse(init.body);assert.equal(body.caip2,source==='bsc'?'eip155:56':'eip155:196');assert.equal(init.headers['privy-idempotency-key'],saved.quote.id);assert.equal(init.headers['privy-authorization-signature'],'ephemeral-signature');assert.deepEqual(body.params.calls,charged.plan.calls.map(c=>({to:c.target,data:c.data,value:'0x'+c.value.toString(16)})));assert.equal(rows.get(saved.quote.id).state,'submitting');throw Error('response lost')}
  return {ok:true,json:async()=>({requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},user:i.sender,recipient:i.recipient,data:{inTxs:[{chainId:source==='bsc'?56:196,txHash:sourceHash}]}}]})}
 },overrides:{now:()=>time,durable:()=>true,wallets:async()=>{},approve:async()=>true,open:(token,owner,recovery)=>openCrossBridgeReview(token,owner,{secret,now:time,recovery}),source:async(review,hash)=>{proofs++;assert.equal(hash,sourceHash);assert.equal(review.charged.planHash,charged.planHash);return 'confirmed'},store:{read:async id=>structuredClone(rows.get(id)),mutate:async(id,fn)=>{const next=fn(structuredClone(rows.get(id)));rows.set(id,next);return structuredClone(next)}}}}
 const runtime=()=>createCrossBridgePrivyRuntime('owner',async()=>{},opts)
 await runtime().prepare(saved.quoteToken,'pin');assert.equal((await runtime().request(saved.quote.id)).headers['privy-idempotency-key'],saved.quote.id)
 await Promise.all([runtime().submit(saved.quote.id,'ephemeral-signature'),runtime().submit(saved.quote.id,'ephemeral-signature')]);assert.equal(sends,1)
 time+=90000;assert.equal((await runtime().status(saved.quote.id)).sourceHash,sourceHash);assert.equal(proofs,1)
 await runtime().submit(saved.quote.id,'ephemeral-signature');assert.equal(sends,1);assert.equal((await runtime().cancel(saved.quote.id)).state,'submitted');assert(!JSON.stringify([...rows]).includes('ephemeral-signature'))
 await assert.rejects(()=>createCrossBridgePrivyRuntime('other',async()=>{},opts).read(saved.quote.id));cases++
}
console.log(`PASS ${cases} BSC/X Layer assets: exact native/token requests, L1-inclusive X Layer cost, BSC L1 exclusion, single durable dispatch, response-loss order discovery and exact source proof, expiry recovery, no stored signatures or repeat send. Mocked providers only.`)
