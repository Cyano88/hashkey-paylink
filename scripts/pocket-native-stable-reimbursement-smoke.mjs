import assert from 'node:assert/strict'
import {decodeFunctionData,encodeFunctionData,encodeEventTopics,encodeAbiParameters,parseAbi,formatUnits,getAddress} from 'viem'
import {fixture,owner,wallet,hash} from './fixtures/native-evm-swap.mjs'
import {quoteReimbursedNativeEvmSwap,nativeSwapCalls,nativeSwapBatch,validateNativeEvmSwap,sealNativeEvmSwap,openNativeEvmSwap} from '../api/pocket/native-evm-swap-quote.ts'
import {nativeSwapOutput,reconcileNativeEvmSwap} from '../api/pocket/native-evm-swap-reconciliation.ts'
import {createNativeEvmSwapHandler,nativeSwapReview} from '../api/pocket/native-evm-swap.ts'
import {COMPACT_V3_ABI,ETHEREUM_WETH,ethereumV3Pool} from '../api/pocket/native-ethereum-compact-swap.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import routerAbi from '../src/pocket/lib/pocketOkxRouterAbi.json' with {type:'json'}
process.env.POCKET_SWAP_QUOTE_SECRET='stable-reimbursement-test-'.repeat(3)
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)','function transfer(address recipient,uint256 amount) returns(bool)'])
let scenarios=0
for(const network of ['ethereum','base','arbitrum','polygon'])for(const stable of ['USDC','USDT']){
 const f=await fixture(network,true,stable),rate=BigInt(network==='polygon'?100000000:200000000000),calls=[]
 const provider=async(path,args)=>{calls.push(path);if(path==='approve-transaction')return{dexContractAddress:f.q.spender};const r=structuredClone(f.response),units=BigInt(args.amount),out=units*500000000n,min=out*995n/1000n;r.routerResult.fromTokenAmount=String(units);r.routerResult.toTokenAmount=String(out);r.routerResult.toToken.tokenUnitPrice='2000';r.tx.minReceiveAmount=String(min)
 if(network==='ethereum'){const token=r.routerResult.fromToken.tokenContractAddress,pool=ethereumV3Pool(token,ETHEREUM_WETH,500),packed=BigInt(pool.address)|(pool.token1.toLowerCase()===token.toLowerCase()?1n<<255n:0n)|(1n<<253n);r.tx.data=encodeFunctionData({abi:COMPACT_V3_ABI,functionName:'uniswapV3SwapTo',args:[BigInt(wallet),units,min,[packed]]})}
 else {const decoded=decodeFunctionData({abi:routerAbi,data:r.tx.data});decoded.args[1].fromTokenAmount=units;decoded.args[1].minReturnAmount=min;r.tx.data=encodeFunctionData({abi:routerAbi,functionName:decoded.functionName,args:decoded.args})}return r}
 let estimates=0
 const q=await quoteReimbursedNativeEvmSwap(f.binding,async()=>{estimates++;return '0.00001'},provider,()=>f.now,async q=>BigInt(q.totalInputUnits)<=1000000n,rate)
 assert.equal(q.version,2);assert.equal(q.amount,'1');assert.equal(BigInt(q.amountUnits)+BigInt(q.stableFeeUnits),1000000n);assert.equal(estimates,2);assert.equal(calls.filter(x=>x==='swap').length,2,'bounded two executable routes, no idle refresh');assert.equal(calls.filter(x=>x==='approve-transaction').length,1)
 const review=nativeSwapReview(q);assert.equal(review.feeAsset,stable);assert.equal(review.feeFromOutput,false);assert.equal(review.feeIncludedInInput,true);assert.equal(review.expectedOut,formatUnits(BigInt(q.expectedOutUnits),18));assert.equal(review.minimumOut,formatUnits(BigInt(q.minimumOutUnits),18))
 const batch=nativeSwapCalls(q);assert(batch.every(c=>c.value===0n),'no native reimbursement or native balance needed');const fee=decodeFunctionData({abi:transferAbi,data:batch.at(-1).data});assert.equal(fee.args[0],EVM_PLATFORM_TREASURY);assert.equal(fee.args[1],BigInt(q.stableFeeUnits));assert.equal(batch.at(-1).target.toLowerCase(),f.response.routerResult.fromToken.tokenContractAddress.toLowerCase())
 const outgoing=batch.map(c=>({type:'CALL',from:wallet,to:c.target,input:c.data,value:'0x0'}));outgoing[2].calls=[{type:'CALL',from:q.tx.to,to:wallet,input:'0x',value:'0x'+BigInt(q.expectedOutUnits).toString(16)}];outgoing.at(-1).logs=[{address:batch.at(-1).target,topics:encodeEventTopics({abi:transferAbi,eventName:'Transfer',args:{from:wallet,to:EVM_PLATFORM_TREASURY}}),data:encodeAbiParameters([{type:'uint256'}],[BigInt(q.stableFeeUnits)])}]
 const trace={type:'CALL',to:wallet,input:q.callData,calls:outgoing};assert.equal(nativeSwapOutput(q,trace),BigInt(q.expectedOutUnits))
 const missingFee=structuredClone(trace);delete missingFee.calls.at(-1).logs;assert.equal(nativeSwapOutput(q,missingFee),null,'no success without reimbursement proof')
 const wrongFee=structuredClone(trace);wrongFee.calls.at(-1).logs[0].data=encodeAbiParameters([{type:'uint256'}],[BigInt(q.stableFeeUnits)+1n]);assert.equal(nativeSwapOutput(q,wrongFee),null)
 const extra=structuredClone(trace);extra.calls.push(extra.calls.at(-1));assert.equal(nativeSwapOutput(q,extra),null,'duplicate fee rejected')
 for(const change of [x=>x.stableFeeUnits=String(BigInt(x.stableFeeUnits)+1n),x=>x.totalInputUnits='1000001',x=>x.rateScaled8='1',x=>x.amountUnits='1',x=>x.version=1,x=>x.feeUnits='1',x=>x.walletAddress=EVM_PLATFORM_TREASURY]){const bad=structuredClone(q);change(bad);bad.callData=nativeSwapBatch(bad);assert.throws(()=>validateNativeEvmSwap(bad,false,f.now))}
 const token=sealNativeEvmSwap(q);assert.equal(openNativeEvmSwap(token,owner,true,f.now+50000).version,2);assert.throws(()=>openNativeEvmSwap(token,'other',true,f.now));assert.throws(()=>openNativeEvmSwap(token,owner,false,f.now+50000))
 let record=null,writes=0,currentRate=rate,currentGas='0.00001',balance=1000000n,clock=f.now,priceDown=false
 const ids={ethereum:1,base:8453,arbitrum:42161,polygon:137},chains={ethereum:'ETH',base:'BASE',arbitrum:'ARB',polygon:'MATIC'}
 const deps={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:network,purpose:'payment',circleBlockchain:chains[network],circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>true,now:()=>clock,approval:async()=>true,rate:async(...args)=>{assert.equal(args[3],stable);if(priceDown)throw Error('unavailable');return currentRate},estimate:async()=>currentGas,quote:(b,e,_r,n,a,r)=>quoteReimbursedNativeEvmSwap(b,e,provider,n,a,r),find:async()=>record,list:async()=>record?[record]:[],claim:async input=>{record={...input,status:'started',id:'fixture'};return{claimed:true,record}},record:async r=>{record=r;return r},challenge:async()=>{writes++;throw Error('Timeout after submission')},rpc:async(_n,m)=>({eth_chainId:'0x'+ids[network].toString(16),eth_call:'0x'+balance.toString(16),eth_getTransactionReceipt:{status:'0x1',blockHash:hash,transactionHash:hash,blockNumber:'0x10'},eth_getBlockByNumber:{hash},debug_traceTransaction:trace}[m])}
 const handler=createNativeEvmSwapHandler(deps);async function call(body){let status=200,data;await handler({method:'POST',body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return{status,data}}
 const quoteBody={action:'quote',network,from:stable,to:q.to,amount:'1'};assert.equal((await call(quoteBody)).status,200)
 const execute={action:'execute',quoteToken:token};balance=999999n;assert.equal((await call(execute)).status,409);balance=1000000n
 currentRate=rate*2n;assert.equal((await call(execute)).status,409);currentRate=rate;priceDown=true;assert.equal((await call(execute)).status,503);priceDown=false
 currentGas='0.001';assert.equal((await call(execute)).status,409);currentGas='0.00001';assert.equal(writes,0);assert.equal(record,null)
 assert.equal((await call(execute)).status,503);assert.equal(writes,1);await call(execute);assert.equal(writes,1,'unknown outcome never submits or collects twice');assert.equal(record.metadata.feeAsset,stable);assert.equal(record.metadata.feeAmount,review.fee)
 record={...record,status:'submitted',metadata:{...record.metadata,txHash:hash}};clock+=60000;priceDown=true
 const result=await reconcileNativeEvmSwap(record,{rpc:deps.rpc,record:deps.record});assert.equal(result.status,'completed');assert.equal(result.amountOut,review.expectedOut,'no output fee subtracted a second time')
 await assert.rejects(()=>quoteReimbursedNativeEvmSwap({...f.binding,amount:'0.000001'},async()=> '0.01',provider,()=>f.now,undefined,rate),/too small/)
 await assert.rejects(()=>quoteReimbursedNativeEvmSwap(f.binding,async()=> '0.01',provider,()=>f.now,undefined),/pricing/)
 scenarios++
}
console.log('PASS '+scenarios+' stable-input routes: total spending cap, bounded quotes, USDC/USDT atomic fees, zero native debit, exact settlement proof, tamper rejection, price/gas/affordability checks, idempotency and expired recovery')
