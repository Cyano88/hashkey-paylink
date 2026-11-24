import {decodeFunctionData,encodeFunctionData,parseAbi,type Address,type Hex} from 'viem'
import type {CrossBridgeInput} from './cross-bridge-provider.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'

const DIAMOND='0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE'
const CNGN='0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f'
const AXL_USDC='0xEB466342C4d449BC9f53A865D5Cb90586f405215'
const BASE_USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const SQUID_ROUTER='0xce16F69375520ab01377ce7B88f5BA8C48F8D666'
const CELO='0x0000000000000000000000000000000000000000'
const squidAbi=parseAbi([
 'function approve(address spender,uint256 amount) returns(bool)',
 'function swapAndStartBridgeTokensViaSquid((bytes32 transactionId,string bridge,string integrator,address referrer,address sendingAssetId,address receiver,uint256 minAmount,uint256 destinationChainId,bool hasSourceSwaps,bool hasDestinationCall) bridgeData,(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[] swaps,(uint8 routeType,string destinationChain,string destinationAddress,string bridgedTokenSymbol,address depositAssetId,(uint8 callType,address target,uint256 value,bytes callData,bytes payload)[] sourceCalls,bytes payload,uint256 fee,bool enableExpress) squidData) payable',
])
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const units=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,38}$/.test(v)&&BigInt(v)<2n**128n
const invalid=():never=>{throw Object.assign(Error('Jumper returned a route that Pocket cannot verify. Try another route.'),{status:503,code:'lifi_route_unverified'})}
const zero=(v:unknown)=>typeof v==='string'&&/^0x0{40}$/i.test(v)
const hex=(v:unknown):v is Hex=>typeof v==='string'&&/^0x(?:[0-9a-f]{2})*$/i.test(v)

export type CrossBridgeLifiQuote={kind:'lifi-cross-bridge';response:unknown;issuedAt:number;expiresAt:number}
export type CrossBridgeLifiDetails={transactionId:Hex;providerFeeUnits:string;nativeValueUnits:string;bridgeTokenAddress:string;bridgeMinimumUnits:string;tool:'squid'}

/** Narrow LI.FI fallback: only the verified Celo cNGN -> Base USDC Squid path.
 * It fails closed if LI.FI changes its route shape, fee model, or call targets. */
export function validateCrossBridgeLifiQuote(q:CrossBridgeLifiQuote,i:CrossBridgeInput,now=Date.now()){
 const fail=()=>invalid()
 if(i.source!=='celo'||i.destination!=='base'||i.from!=='cNGN'||i.to!=='USDC'||i.purpose!=='cash'||!units(i.amountUnits))return fail()
 if(!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=now||q.expiresAt-q.issuedAt>45000)return fail()
 const b=q.response as any,a=b?.action,e=b?.estimate,t=b?.transactionRequest
 if(b?.type!=='lifi'||b?.tool!=='squid'||!Array.isArray(b.includedSteps)||b.includedSteps.length!==3)return fail()
 if(a?.fromChainId!==42220||a?.toChainId!==8453||!same(a.fromAddress,i.sender)||!same(a.toAddress,i.recipient)||!same(a.fromToken?.address,CNGN)||a.fromToken?.decimals!==6||a.fromAmount!==i.amountUnits||!same(a.toToken?.address,BASE_USDC)||a.toToken?.decimals!==6)return fail()
 if(e?.tool!=='squid'||e.fromAmount!==i.amountUnits||!units(e.toAmount)||!units(e.toAmountMin)||BigInt(e.toAmountMin)>BigInt(e.toAmount)||!same(e.approvalAddress,DIAMOND))return fail()
 if(t?.chainId!==42220||!same(t.from,i.sender)||!same(t.to,DIAMOND)||!hex(t.data)||!/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(t.value||''))return fail()
 const value=BigInt(t.value)
 if(value<=0n||value>=2n**128n)return fail()
 const steps=b.includedSteps
 const feeStep=steps[0],swapStep=steps[1],bridgeStep=steps[2]
 if(feeStep.type!=='protocol'||feeStep.tool!=='feeCollection'||swapStep.type!=='swap'||swapStep.tool!=='nordstern'||bridgeStep.type!=='cross'||bridgeStep.tool!=='squid')return fail()
 if(feeStep.action?.fromChainId!==42220||feeStep.action?.toChainId!==42220||swapStep.action?.fromChainId!==42220||swapStep.action?.toChainId!==42220||bridgeStep.action?.fromChainId!==42220||bridgeStep.action?.toChainId!==8453)return fail()
 if(!same(feeStep.action?.fromToken?.address,CNGN)||!same(feeStep.action?.toToken?.address,CNGN)||feeStep.action?.fromAmount!==i.amountUnits||!same(swapStep.action?.fromToken?.address,CNGN)||!same(swapStep.action?.toToken?.address,AXL_USDC)||!same(bridgeStep.action?.fromToken?.address,AXL_USDC)||!same(bridgeStep.action?.toToken?.address,BASE_USDC)||!same(bridgeStep.action?.toAddress,i.recipient))return fail()
 const fee=feeStep.estimate?.feeCosts?.find((x:any)=>x.name==='LIFI Fixed Fee'&&x.included===true&&same(x.token?.address,CNGN))
 const receiverFee=e.feeCosts?.find((x:any)=>x.name==='Gas receiver fee'&&x.included===false&&same(x.token?.address,CELO))
 if(!fee||!units(fee.amount)||BigInt(fee.amount)>=BigInt(i.amountUnits)||!receiverFee||!units(receiverFee.amount)||BigInt(receiverFee.amount)!==value)return fail()
 if(feeStep.estimate?.fromAmount!==i.amountUnits||feeStep.estimate?.toAmount!==String(BigInt(i.amountUnits)-BigInt(fee.amount))||swapStep.action?.fromAmount!==String(BigInt(i.amountUnits)-BigInt(fee.amount)))return fail()
 if(!same(feeStep.estimate?.approvalAddress,steps[0].estimate?.approvalAddress)||!same(swapStep.estimate?.approvalAddress,steps[1].estimate?.approvalAddress))return fail()
 let decoded:any
 try{decoded=decodeFunctionData({abi:squidAbi,data:t.data})}catch{return fail()}
 const [bridge,swaps,squid]=decoded.args as any
 if(!same(bridge.bridge,'squid')||bridge.integrator!=='lifi-api'||!zero(bridge.referrer)||!same(bridge.receiver,i.recipient)||bridge.destinationChainId!==8453n||!bridge.hasSourceSwaps||bridge.hasDestinationCall||!same(bridge.sendingAssetId,AXL_USDC)||bridge.minAmount<BigInt(e.toAmountMin)||bridge.minAmount>BigInt(e.toAmount))return fail()
 if(swaps.length!==2||!same(swaps[0].sendingAssetId,CNGN)||!same(swaps[0].receivingAssetId,CNGN)||swaps[0].fromAmount!==BigInt(i.amountUnits)||!swaps[0].requiresDeposit||!same(swaps[0].callTo,feeStep.estimate.approvalAddress)||!same(swaps[0].approveTo,feeStep.estimate.approvalAddress)||!hex(swaps[0].callData)||
    !same(swaps[1].sendingAssetId,CNGN)||!same(swaps[1].receivingAssetId,AXL_USDC)||swaps[1].fromAmount!==BigInt(i.amountUnits)-BigInt(fee.amount)||swaps[1].requiresDeposit||!same(swaps[1].callTo,swapStep.estimate.approvalAddress)||!same(swaps[1].approveTo,swapStep.estimate.approvalAddress)||!hex(swaps[1].callData))return fail()
 if(squid.routeType!==0||squid.destinationChain!=='base'||squid.destinationAddress!==SQUID_ROUTER||squid.bridgedTokenSymbol!=='axlUSDC'||!same(squid.depositAssetId,AXL_USDC)||squid.fee!==value||squid.sourceCalls.length!==1||!zero(squid.sourceCalls[0].target)||squid.sourceCalls[0].value!==0n||squid.sourceCalls[0].callData!=='0x'||!/^0x0*$/i.test(squid.sourceCalls[0].payload)||!hex(squid.payload)||squid.payload.length>30000)return fail()
 const canonical=encodeFunctionData({abi:squidAbi,functionName:'swapAndStartBridgeTokensViaSquid',args:decoded.args as any})
 if(canonical.toLowerCase()!==t.data.toLowerCase())return fail()
 const tokenIn=crossBridgeAsset('celo','cNGN'),tokenOut=crossBridgeAsset('base','USDC'),amount=BigInt(i.amountUnits),approve=(n:bigint)=>({target:CNGN as Address,value:0n,data:encodeFunctionData({abi:squidAbi,functionName:'approve',args:[DIAMOND as Address,n]})})
 const calls=[approve(0n),approve(amount),{target:DIAMOND as Address,value,data:t.data as Hex},approve(0n)]
 const execution={kind:'evm' as const,calls,callData:encodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),functionName:'executeBatch',args:[calls]})}
 const platformFee={provider:'lifi',amount:String(fee.amount)}
 const id=bridge.transactionId as Hex
 const refundOptions=[{network:'celo' as const,asset:'cNGN',address:CNGN,decimals:6,recipient:i.sender},{network:'base' as const,asset:'USDC',address:BASE_USDC,decimals:6,recipient:i.recipient}]
 return {provider:'lifi' as const,platformFee,orderId:id,requestId:id,source:i.source,destination:i.destination,tokenIn,tokenOut,amountUnits:i.amountUnits,receiveUnits:String(e.toAmount),minimumUnits:String(e.toAmountMin),expiresAt:q.expiresAt,refundOptions,execution,lifi:{transactionId:id,providerFeeUnits:String(fee.amount),nativeValueUnits:String(value),bridgeTokenAddress:AXL_USDC,bridgeMinimumUnits:String(bridge.minAmount),tool:'squid' as const}}
}

export async function fetchCrossBridgeLifiReview(i:CrossBridgeInput,fetcher=fetch,now=Date.now){
 const requestedAt=now(),params=new URLSearchParams({fromChain:'42220',toChain:'8453',fromToken:CNGN,toToken:BASE_USDC,fromAmount:i.amountUnits,fromAddress:i.sender,toAddress:i.recipient,slippage:'0.005',allowBridges:'squid',allowExchanges:'nordstern'})
 const response=await fetcher('https://li.quest/v1/quote?'+params,{headers:process.env.LIFI_API_KEY?{'x-lifi-api-key':process.env.LIFI_API_KEY}:{},redirect:'error',signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Object.assign(Error('Jumper could not find a route right now. Try again later.'),{status:response.status===429?429:503,code:response.status===429?'rate_limited':'lifi_route_unavailable'})
 const body=await response.json(),quote:CrossBridgeLifiQuote={kind:'lifi-cross-bridge',response:body,issuedAt:requestedAt,expiresAt:requestedAt+30000},route=validateCrossBridgeLifiQuote(quote,i,requestedAt)
 if(route.expiresAt<=now())throw Error('Bridge quote expired. Review again.')
 return {providerQuote:quote,route,requestedAt}
}
