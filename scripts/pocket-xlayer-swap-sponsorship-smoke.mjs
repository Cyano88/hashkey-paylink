import {readSponsoredSwapOutcome} from '../api/pocket/xlayer-swap-settlement.ts'
import {encodeXLayerSponsoredBatch,XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
import {stockTradeProof,recordStockTradeNotices,nativeTradeLegs} from '../api/pocket/stock-trade-notifications.ts'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {encodeEventTopics,encodeAbiParameters,parseAbi,parseAbiParameters} from 'viem'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeFunctionData,getAddress} from 'viem'
import {stockUsdc,stockUsdt,stockUsde,stockUsdg,stockGasAsset,stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
import {readStockServiceFee,OKX_STOCK_FEE_RECIPIENT,OKX_NATIVE,OKX_XLAYER_ROUTER,OKX_XLAYER_SPENDER} from '../src/pocket/lib/pocketXStocksSwap.ts'
import {sponsoredSwapCalls,validateSponsoredSwap} from '../src/pocket/lib/pocketSponsoredSwap.ts'
import {swapFeeBinding,verifySponsoredSwap} from '../api/pocket/xlayer-swap-sponsorship.ts'
import {quoteXLayerReimbursement,sealXLayerReimbursement} from '../api/pocket/xlayer-reimbursement.ts'
import {sealStockQuote} from '../api/pocket/xstocks-swap-provider.ts'
import {makeSponsoredBatchRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {createXLayerSponsorshipHandler} from '../api/pocket/xlayer-sponsorship.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='test-only-quote-secret-at-least-thirty-two-characters'
const owner='owner',walletId='fixturewalletid12345',wallet=getAddress('0x'+'1'.repeat(40)),abi=JSON.parse(readFileSync('src/pocket/lib/pocketOkxRouterAbi.json','utf8'))
const pricing={marginBps:2500,minimumFeeUnits:'10000'}
for(const tokenIn of [stockUsdc,stockUsdt,stockUsde,stockUsdg])for(const tokenOut of [stockGasAsset,...([stockUsdc,stockUsdt].includes(tokenIn)?[stockAssets[0]]:[]),tokenIn===stockUsdc?stockUsdt:stockUsdc])for(const service of stockAssets.includes(tokenOut)?[false,true]:[false]){
 const inputDecimals=tokenIn.symbol==='USDe'?18:6,inputUnits=10n**BigInt(inputDecimals),scale=inputUnits/1000000n
 const stableOutput=['USDC','USDT'].includes(tokenOut.symbol),outUnits=stableOutput?1000000n:1000000000000000n,minUnits=outUnits*995n/1000n
 const outAddress=tokenOut.address==='native'?OKX_NATIVE:tokenOut.address
 const q={id:crypto.randomUUID(),chainId:196,owner:wallet,tokenIn,tokenOut,amount:'1',amountUnits:String(inputUnits),decimalsIn:inputDecimals,decimalsOut:stableOutput?6:18,expectedOut:stableOutput?'1':'0.001',minimumOut:stableOutput?'0.995':'0.000995',minimumOutUnits:String(minUnits),expiresAt:Date.now()+45000,gasFee:'0.00001',priceImpact:'0',approvalRequired:true,spender:getAddress(OKX_XLAYER_SPENDER),tx:{from:wallet,to:getAddress(OKX_XLAYER_ROUTER),value:'0',data:encodeFunctionData({abi,functionName:'uniswapV3SwapToWithBaseRequest',args:[1n,wallet,{fromToken:BigInt(tokenIn.address),toToken:getAddress(outAddress),fromTokenAmount:service?inputUnits*9975n/10000n:inputUnits,minReturnAmount:minUnits,deadLine:BigInt(Math.floor(Date.now()/1000)+300)},[1n]]})}}
 if(service){const word=n=>n.toString(16).padStart(64,'0');q.tx.data+=word((0x22220afc2aaan<<208n)|(2000000n<<160n)|BigInt(EVM_PLATFORM_TREASURY))+word((1n<<255n)|BigInt(tokenIn.address))+word((0x22220afc2aaan<<208n)|(500000n<<160n)|BigInt(OKX_STOCK_FEE_RECIPIENT));q.serviceFee=readStockServiceFee(q.tx.data)}
 const calls=sponsoredSwapCalls(q);assert.equal(calls.length,4)
 const estimate=async i=>{assert.equal(i.calls.length,5);assert.equal(i.calls[2].data,q.tx.data);return {feeUnits:String(8000n*scale),expiresAt:Date.now()+25000,estimateId:'fixture'}}
 const fee=await quoteXLayerReimbursement(swapFeeBinding(q,owner,walletId),calls,q.expiresAt,estimate,pricing)
 const routeToken=sealStockQuote(q,owner),feeToken=sealXLayerReimbursement(fee),request=makeSponsoredBatchRequest({appId:'fixture',walletId,attemptId:q.id,expiresAt:fee.expiresAt,calls:fee.calls}),s={feeToken,feeUnits:fee.networkFeeUnits,totalUnits:fee.totalUnits,expiresAt:fee.expiresAt,request}
 validateSponsoredSwap(q,s);assert.equal(s.totalUnits,String(inputUnits+10000n*scale));await verifySponsoredSwap({routeToken,feeToken,ownerId:owner,walletId,wallet},estimate)
 for(const mutate of [x=>x.body.params.calls.pop(),x=>x.body.params.calls[2].to=wallet,x=>x.body.params.calls[4].data='0x',x=>x.body.caip2='eip155:1']){const request=structuredClone(s.request);mutate(request);assert.throws(()=>validateSponsoredSwap(q,{...s,request}))}
 await assert.rejects(verifySponsoredSwap({routeToken,feeToken,ownerId:'other',walletId,wallet},estimate))
 await assert.rejects(verifySponsoredSwap({routeToken,feeToken,ownerId:owner,walletId:'differentWallet',wallet},estimate))
 const op={sender:wallet,nonce:0n,initCode:'0x',callData:encodeXLayerSponsoredBatch(fee.calls),accountGasLimits:'0x'+'0'.repeat(64),preVerificationGas:1n,gasFees:'0x'+'0'.repeat(64),paymasterAndData:'0x',signature:'0x'}
 const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
 const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
 const hash='0x'+'b'.repeat(64),outer={hash,from:OKX_XLAYER_ROUTER,to:XLAYER_ENTRY_POINT,input:encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[op],wallet]})}
 const operationLog={address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:eventAbi,args:{userOpHash:hash,sender:wallet,paymaster:'0x'+'0'.repeat(40)}}),data:encodeAbiParameters(parseAbiParameters('uint256,bool,uint256,uint256'),[0n,true,0n,1n])}
 const feeLog={address:tokenIn.address,topics:encodeEventTopics({abi:transferAbi,args:{from:wallet,to:EVM_PLATFORM_TREASURY}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[BigInt(fee.networkFeeUnits)])}
 const serviceAbi=parseAbi(['event CommissionFromTokenRecord(address fromTokenAddress,uint256 commissionAmount,address referrerAddress,uint256 commissionRate)']);const serviceLogs=service?[[EVM_PLATFORM_TREASURY,2000n*scale,2000000n],[OKX_STOCK_FEE_RECIPIENT,500n*scale,500000n]].map(([recipient,units,rate])=>({address:OKX_XLAYER_ROUTER,topics:encodeEventTopics({abi:serviceAbi}),data:encodeAbiParameters(parseAbiParameters('address,uint256,address,uint256'),[tokenIn.address,units,recipient,rate])})):[]
 const receipt={status:'success',logs:[operationLog,feeLog,...serviceLogs]},proof=stockTradeProof(outer,receipt)
 if(service){assert.equal(proof.serviceFeeUnits,String(2500n*scale));assert.equal(stockTradeProof(outer,{...receipt,logs:[operationLog,feeLog]}),undefined)}
 assert.equal(proof?.owner,wallet.toLowerCase());assert.equal(proof.feeUnits,String(10000n*scale));assert.equal(proof.inputUnits,String(inputUnits))
 assert.equal(stockTradeProof(outer,{...receipt,logs:[operationLog]}),undefined)
 assert.equal(stockTradeProof(outer,{...receipt,status:'reverted'}),undefined)
 assert.equal(stockTradeProof(outer,{...receipt,logs:[{...operationLog,data:encodeAbiParameters(parseAbiParameters('uint256,bool,uint256,uint256'),[0n,false,0n,1n])},feeLog]}),undefined)
 const orderAbi=parseAbi(['event OrderRecord(address fromToken,address toToken,address sender,uint256 fromAmount,uint256 returnAmount)'])
 const orderLog={address:OKX_XLAYER_ROUTER,topics:encodeEventTopics({abi:orderAbi}),data:encodeAbiParameters(parseAbiParameters('address,address,address,uint256,uint256'),[tokenIn.address,outAddress,outer.from,inputUnits,outUnits])}
 const debitLog={address:tokenIn.address,topics:encodeEventTopics({abi:transferAbi,args:{from:wallet,to:OKX_XLAYER_ROUTER}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[inputUnits])}
 const outputLog={address:outAddress,topics:encodeEventTopics({abi:transferAbi,args:{from:OKX_XLAYER_ROUTER,to:wallet}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[outUnits])}
 const blockHash='0x'+'c'.repeat(64),full={...receipt,transactionHash:hash,blockHash,blockNumber:1n,logs:[...receipt.logs,orderLog,debitLog,...(tokenOut.address==='native'?[]:[outputLog])]}
 const evidence={owner:wallet,input:tokenIn.address,...(tokenOut.address==='native'?{}:{output:tokenOut.address}),inputUnits:q.amountUnits,minimumOutUnits:q.minimumOutUnits,feeUnits:fee.networkFeeUnits,callData:op.callData}
 const client={getChainId:async()=>196,getTransaction:async()=>({...outer,blockHash}),getTransactionReceipt:async()=>full,getBlock:async()=>({hash:blockHash,timestamp:1n})}
 assert.equal(await readSponsoredSwapOutcome(hash,evidence,client),'completed')
 if(tokenOut.address==='native'){
  assert.equal(proof.origin,outer.from.toLowerCase())
  await assert.rejects(readSponsoredSwapOutcome(hash,evidence,{...client,getTransaction:async()=>({...outer,from:'0x'+'9'.repeat(40),blockHash})}))
 }
 assert.equal(await readSponsoredSwapOutcome(hash,evidence,{...client,getTransactionReceipt:async()=>({...full,status:'reverted'})}),'failed')
 const failedEvent={...operationLog,data:encodeAbiParameters(parseAbiParameters('uint256,bool,uint256,uint256'),[0n,false,0n,1n])}
 assert.equal(await readSponsoredSwapOutcome(hash,evidence,{...client,getTransactionReceipt:async()=>({...full,logs:[failedEvent]})}),'failed')
 for(const changed of [{...evidence,minimumOutUnits:'999999999999999999'},{...evidence,callData:'0x'},{...evidence,inputUnits:'2'},{...evidence,feeUnits:'1'}])await assert.rejects(readSponsoredSwapOutcome(hash,changed,client))
 await assert.rejects(readSponsoredSwapOutcome(hash,evidence,{...client,getBlock:async()=>({hash:'0x'+'d'.repeat(64),timestamp:1n})}))
 if(tokenOut.address!=='native'){
  await assert.rejects(readSponsoredSwapOutcome(hash,{...evidence,output:stockAssets[1].address},client))
  await assert.rejects(readSponsoredSwapOutcome(hash,evidence,{...client,getTransactionReceipt:async()=>({...full,logs:full.logs.filter(l=>l!==outputLog)})}))
  await assert.rejects(readSponsoredSwapOutcome(hash,evidence,{...client,getTransactionReceipt:async()=>({...full,logs:full.logs.map(l=>l===outputLog?{...l,data:encodeAbiParameters(parseAbiParameters('uint256'),[1n])}:l)})}))
 }
 const notices={wallets:{owner:{address:wallet,since:0}},notices:{}}
 const legs=[{id:hash+':1',hash,from:wallet,to:OKX_XLAYER_ROUTER,token:tokenIn.address.toLowerCase(),symbol:tokenIn.symbol,units:q.amountUnits,decimals:inputDecimals,at:1},{id:hash+':2',hash,from:wallet,to:EVM_PLATFORM_TREASURY,token:tokenIn.address.toLowerCase(),symbol:tokenIn.symbol,units:fee.networkFeeUnits,decimals:inputDecimals,at:1},...(tokenOut.address==='native'?nativeTradeLegs(proof,full.logs,1):[{id:hash+':out',hash,from:OKX_XLAYER_ROUTER,to:wallet,token:tokenOut.address.toLowerCase(),symbol:tokenOut.symbol,units:String(outUnits),decimals:stableOutput?6:18,at:1}])]
 recordStockTradeNotices(notices,legs,[proof]);const trade=Object.values(notices.notices)[0].trade;assert.equal(trade.input.amount,'1');assert.equal(trade.feeAmount,'0.01');assert.equal(trade.output.symbol,tokenOut.symbol);assert.equal(trade.action,stockAssets.includes(tokenOut)?'buy':'swap')
 let store,broadcasts=0;const handler=createXLayerSponsorshipHandler({identity:async()=>({userId:owner}),user:async()=>({linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',address:wallet,id:walletId}]}),config:()=>({appId:'fixture',secret:'fixture',enabled:true,publicTransfers:true,wallets:[]}),durable:()=>true,billingGuard:async()=>{},reimbursement:{estimate,pricing},read:async()=>store,mutate:async fn=>(store=fn(store)),fetch:async()=>{broadcasts++;return new Response(JSON.stringify({data:{hash:'0x'+'a'.repeat(64),transaction_id:'fixturetransaction1234',user_operation_hash:'0x'+'e'.repeat(64),caip2:'eip155:196'}}))}})
 const body={action:'send',purpose:'swap',wallet,routeToken,feeToken,request,signature:'a'.repeat(88)}
 const call=async b=>{const result={status:200};await handler({method:'POST',body:b},{setHeader(){},status(n){result.status=n;return this},json(x){result.body=x;return this}});return result}
 assert.equal((await call({...body,request:{...request,body:{...request.body,caip2:'eip155:1'}}})).status,422);assert.equal(broadcasts,0)
 assert.equal((await call(body)).status,200);assert.equal(broadcasts,1);assert.equal((await call(body)).status,200);assert.equal(broadcasts,1);assert.equal(store.requests[q.id].transactionId,'fixturetransaction1234');assert.equal(store.requests[q.id].userOperationHash,'0x'+'e'.repeat(64))
}
console.log('PASS USDC/USDT/USDe/USDG sponsored swap exact batch, fee and owner binding, altered authorization rejection, and idempotent submission; no real transactions')
