import assert from 'node:assert/strict'
import {encodeFunctionData,pad,parseAbi} from 'viem'
import {quoteUsdtBridge,validateUsdtBridgeQuote,USDT_BRIDGE_ABI,USDT_BRIDGE_ROUTER,openUsdtBridgeQuote,sealUsdtBridgeQuote,usdtBridgeNetwork} from '../api/pocket/usdt-bridge-provider.ts'
import {bridgeFromActivityRow} from '../src/pocket/lib/pocketBridgeActivity.ts'

const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const tokenIn='0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',tokenOut='0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
const transactionId='0x'+'42'.repeat(32),now=Math.floor(Date.now()/1000)
const bridge={transactionId,bridge:'across',integrator:'hashpaylink',referrer:'0x0000000000000000000000000000000000000000',sendingAssetId:tokenIn,receiver:recipient,minAmount:10000000n,destinationChainId:8453n,hasSourceSwaps:false,hasDestinationCall:false}
const across={receiverAddress:pad(recipient),refundAddress:pad(wallet),sendingAssetId:pad(tokenIn),receivingAssetId:pad(tokenOut),outputAmount:9980000n,outputAmountMultiplier:10n**18n,exclusiveRelayer:pad('0x00'),quoteTimestamp:now,fillDeadline:now+3600,exclusivityParameter:0,message:'0x'}
function route(b=bridge,a=across){return {tool:'across',action:{fromChainId:42161,toChainId:8453,fromToken:{address:tokenIn,decimals:6},toToken:{address:tokenOut,decimals:6},fromAddress:wallet,toAddress:recipient,fromAmount:'10000000'},transactionRequest:{chainId:42161,from:wallet,to:USDT_BRIDGE_ROUTER,value:'0x0',data:encodeFunctionData({abi:USDT_BRIDGE_ABI,functionName:'startBridgeTokensViaAcrossV4',args:[b,a]})},estimate:{approvalAddress:USDT_BRIDGE_ROUTER,toAmount:'9980000',toAmountMin:'9980000'},includedSteps:[{type:'cross'}]}}
const input={source:'arbitrum',destination:'base',walletAddress:wallet,destinationAddress:recipient,amountUnits:10000000n}
assert.equal(validateUsdtBridgeQuote(route(),input).minimum,9980000n)
for(const patch of [{receiver:wallet},{sendingAssetId:tokenOut},{destinationChainId:1n},{minAmount:1n},{hasDestinationCall:true},{hasSourceSwaps:true}])assert.throws(()=>validateUsdtBridgeQuote(route({...bridge,...patch}),input))
for(const patch of [{refundAddress:pad(recipient)},{receiverAddress:pad(wallet)},{receivingAssetId:pad(tokenIn)},{outputAmount:1n},{message:'0x1234'},{fillDeadline:now-1}])assert.throws(()=>validateUsdtBridgeQuote(route(bridge,{...across,...patch}),input))
for(const mutate of [d=>d.transactionRequest.to=wallet,d=>d.transactionRequest.value='1',d=>d.action.toToken.address=tokenIn,d=>d.action.fromAmount='1',d=>d.estimate.toAmountMin='1',d=>d.includedSteps.push({type:'swap'})]){const data=route();mutate(data);assert.throws(()=>validateUsdtBridgeQuote(data,input))}
assert.throws(()=>usdtBridgeNetwork('arc'));assert.throws(()=>usdtBridgeNetwork('solana'))
const key='test-only-bridge-quote-secret-at-least-32-characters',q={ownerId:'owner',expiresAt:Date.now()+30000}
const sealed=sealUsdtBridgeQuote(q,key)
assert.equal(openUsdtBridgeQuote(sealed,'owner',false,key).ownerId,'owner')
assert.throws(()=>openUsdtBridgeQuote(sealed,'other',false,key))
assert.throws(()=>openUsdtBridgeQuote(sealed+'x','owner',false,key))
assert.throws(()=>openUsdtBridgeQuote(sealUsdtBridgeQuote({...q,expiresAt:0},key),'owner',false,key))
assert.equal(bridgeFromActivityRow({assetSymbol:'USDT',source:'wallet-bridge',chain:'arbitrum',destination:'base'}),null)
console.log('USDT bridge validation: valid route, recipient/refund/token/chain/amount/fee rejection, signed quotes, and CCTP isolation passed.')

await quoteUsdtBridge({ownerId:'owner',walletId:'wallet',source:'arbitrum',destination:'base',walletAddress:wallet,destinationAddress:recipient,amount:'10'},async url=>{const u=new URL(url);assert.equal(u.searchParams.get('allowExchanges'),'none');assert.equal(u.searchParams.get('allowBridges'),'across');assert.equal(u.searchParams.get('allowDestinationCall'),'false');return Response.json(route())});
console.log('PASS provider search excludes unaudited conversions while preserving route validation.');

const revenue={recipient:'0x3333333333333333333333333333333333333333',bps:10,amountUnits:'10000'}
const feeAbi=parseAbi(['function forwardERC20Fees(address token,(address recipient,uint256 amount)[] distributions)'])
const distributions=[{recipient:'0x4444444444444444444444444444444444444444',amount:25000n},{recipient:revenue.recipient,amount:10000n}]
function revenueRoute(fees=distributions){
 const data=route();data.estimate.toAmount='9950000';data.estimate.toAmountMin='9950000';data.estimate.feeCosts=[{name:'LIFI Fixed Fee',included:true,token:{address:tokenIn},amount:'35000'}]
 const step={callTo:'0xce40449b773a3e6e5e769adb4e567179d4828cbd',approveTo:'0xce40449b773a3e6e5e769adb4e567179d4828cbd',sendingAssetId:tokenIn,receivingAssetId:tokenIn,fromAmount:10000000n,requiresDeposit:true,callData:encodeFunctionData({abi:feeAbi,functionName:'forwardERC20Fees',args:[tokenIn,fees]})}
 data.transactionRequest.data=encodeFunctionData({abi:USDT_BRIDGE_ABI,functionName:'swapAndStartBridgeTokensViaAcrossV4',args:[{...bridge,minAmount:9965000n,hasSourceSwaps:true},[step],{...across,outputAmount:9950000n}]})
 return data
}
validateUsdtBridgeQuote(revenueRoute(),{...input,revenue})
assert.throws(()=>validateUsdtBridgeQuote(route(),{...input,revenue}))
for(const fees of [[distributions[0],{...distributions[1],recipient:wallet}],[distributions[0],{...distributions[1],amount:9999n}],[{...distributions[0],amount:25001n},distributions[1]],[...distributions,distributions[1]]])assert.throws(()=>validateUsdtBridgeQuote(revenueRoute(fees),{...input,revenue}))
const saved={...process.env}
Object.assign(process.env,{POCKET_BRIDGE_REVENUE_LIFI_ENABLED:'true',POCKET_BRIDGE_REVENUE_BPS:'10',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:revenue.recipient,POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:'So11111111111111111111111111111111111111112',LIFI_API_KEY:'synthetic'})
try{
 const quoted=await quoteUsdtBridge({ownerId:'owner',walletId:'wallet',source:'arbitrum',destination:'base',walletAddress:wallet,destinationAddress:recipient,amount:'10'},async(url,options)=>{assert.equal(new URL(url).searchParams.get('fee'),'0.0010');assert.equal(options.headers['x-lifi-api-key'],'synthetic');return Response.json(revenueRoute())})
 assert.deepEqual(quoted.revenue,revenue);assert.equal(quoted.fee,'0.05');assert.deepEqual(openUsdtBridgeQuote(sealUsdtBridgeQuote(quoted,key),'owner',false,key).revenue,revenue)
}finally{for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];Object.assign(process.env,saved)}
console.log('PASS LI.FI revenue request, exact recipient/amount proof, provider fee ceiling and signed quote; existing single fee includes revenue once.')
