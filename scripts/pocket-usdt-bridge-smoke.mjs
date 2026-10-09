import assert from 'node:assert/strict'
import {encodeFunctionData,pad} from 'viem'
import {validateUsdtBridgeQuote,USDT_BRIDGE_ABI,USDT_BRIDGE_ROUTER,openUsdtBridgeQuote,sealUsdtBridgeQuote,usdtBridgeNetwork} from '../api/pocket/usdt-bridge-provider.ts'
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
