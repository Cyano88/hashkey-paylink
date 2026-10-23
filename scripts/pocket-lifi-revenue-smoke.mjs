import assert from 'node:assert/strict'
import {encodeFunctionData} from 'viem'
import {lifiAbi,validateLifiPlan,LIFI_DIAMOND} from '../src/pocket/lib/pocketLifiOutbound.ts'
import {quoteLifiOutbound} from '../api/pocket/lifi-outbound-bridge.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
const owner='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',revenue={recipient:'0x3333333333333333333333333333333333333333',bps:10,amountUnits:'100000'}
const provider='0x4444444444444444444444444444444444444444',token='0x779ded0c9e1022225f8e0630b35a9b54be713736',forwarder='0xce40449b773a3e6e5e769adb4e567179d4828cbd',zero='0x'+'0'.repeat(64),id='0x'+'a'.repeat(64)
Object.assign(process.env,{POCKET_BRIDGE_REVENUE_LIFI_ENABLED:'true',POCKET_BRIDGE_REVENUE_BPS:'10',POCKET_BRIDGE_REVENUE_EVM_ADDRESS:revenue.recipient,POCKET_BRIDGE_REVENUE_SOLANA_ADDRESS:'So11111111111111111111111111111111111111112',LIFI_API_KEY:'synthetic'})
for(const destination of ['arbitrum','ethereum','polygon']){
 const target=POCKET_USDT_ASSETS[destination],deadline=BigInt(Math.floor(Date.now()/1000)+3600)
 const bd={transactionId:id,bridge:'layerswap',integrator:'hashpaylink',referrer:owner,sendingAssetId:token,receiver:recipient,minAmount:99650000n,destinationChainId:BigInt(target.chainId),hasSourceSwaps:true,hasDestinationCall:false}
 const ld={requestId:id,depositoryReceiver:provider,refundRecipient:owner,nonEVMReceiver:zero,signature:'0x'+'a'.repeat(130),deadline}
 const fees=[{recipient:provider,amount:250000n},{recipient:revenue.recipient,amount:100000n}]
 const makeData=(distributions=fees)=>encodeFunctionData({abi:lifiAbi,functionName:'swapAndStartBridgeTokensViaLayerSwap',args:[bd,[{callTo:forwarder,approveTo:forwarder,sendingAssetId:token,receivingAssetId:token,fromAmount:100000000n,requiresDeposit:true,callData:encodeFunctionData({abi:lifiAbi,functionName:'forwardERC20Fees',args:[token,distributions]})}],ld]})
 const response={tool:'layerswap',action:{fromChainId:196,toChainId:target.chainId,fromAddress:owner,toAddress:recipient,fromToken:{address:token,decimals:6},toToken:{address:target.address,decimals:6},fromAmount:'100000000'},transactionRequest:{chainId:196,from:owner,to:LIFI_DIAMOND,value:'0',data:makeData()},estimate:{fromAmount:'100000000',approvalAddress:LIFI_DIAMOND,toAmount:'99600000',toAmountMin:'99500000'}}
 const p=await quoteLifiOutbound({destination,owner,recipient,amountUnits:'100000000'},async(url,options)=>{assert.equal(new URL(url).searchParams.get('integrator'),'hashpaylink');assert.equal(new URL(url).searchParams.get('fee'),'0.0010');assert.equal(options.headers['x-lifi-api-key'],'synthetic');return Response.json(response)})
 assert.deepEqual(p.revenue,revenue);assert.equal(validateLifiPlan(p).providerFee,350000n)
 for(const patch of [{recipient:owner},{bps:11},{amountUnits:'100001'}])assert.throws(()=>validateLifiPlan({...p,revenue:{...revenue,...patch}}))
 assert.throws(()=>validateLifiPlan({...p,revenue:undefined}))
 assert.throws(()=>validateLifiPlan({...p,data:makeData([fees[0],{...fees[1],recipient:owner}])}))
 assert.throws(()=>validateLifiPlan({...p,data:makeData([{...fees[0],amount:250001n},fees[1]])}))
 // Original, fee-disabled quote remains valid with only the LI.FI distribution.
 bd.minAmount=99750000n
 validateLifiPlan({...p,revenue:undefined,data:makeData([fees[0]])})
}
console.log('PASS all three X Layer LI.FI destinations: integrator/fee request, exact recipient, amount/rate tampering, provider fee cap and fee-disabled compatibility. Synthetic; no transactions.')
