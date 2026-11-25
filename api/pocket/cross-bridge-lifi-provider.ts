import {decodeFunctionData,encodeFunctionData,parseAbi,type Address,type Hex} from 'viem'
import type {CrossBridgeInput} from './cross-bridge-provider.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {lifiAbi,LIFI_DIAMOND} from '../../src/pocket/lib/pocketLifiOutbound.js'
import {assertPocketBridgeRevenue,type PocketBridgeRevenue} from '../../src/pocket/lib/pocketBridgeRevenue.js'
import {lifiBridgeRevenue,lifiRevenueFraction} from './lifi-bridge-revenue.js'

const DIAMOND=LIFI_DIAMOND
const CNGN='0xF6829D7393dAe24509eb1E52eE8e572e2E271a4f'
const BASE_CNGN='0x46C85152bFe9f96829aA94755D9f915F9B10EF5F'
const AXL_USDC='0xEB466342C4d449BC9f53A865D5Cb90586f405215'
const BASE_USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const SQUID_ROUTER='0xce16F69375520ab01377ce7B88f5BA8C48F8D666'
const CELO='0x0000000000000000000000000000000000000000'
// LI.FI's published Base deployment and its Base 1inch router/executor.
const BASE_FEE_FORWARDER='0xDe2b920506EE931a6A2ABDF566526220214FBbAE'
const BASE_ONEINCH_ROUTER='0x111111125421cA6dc452d289314280a0f8842A65'
const BASE_ONEINCH_EXECUTOR='0x111116056aD60f0f4Fb52d60852F9acD2fAFCA11'
const LIFI_FEE_RECIPIENT='0xC06ebbefD94032B85424D51906e2A335EFAe264B'
const oneInchAbi=parseAbi(['function swap(address executor,(address srcToken,address dstToken,address srcReceiver,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags) desc,bytes data) payable returns(uint256 returnAmount)'])
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
export type CrossBridgeLifiDetails={transactionId:Hex;providerFeeUnits:string;providerFeeUsd?:string;integratorFeeUnits?:string;nativeValueUnits:string;bridgeTokenAddress:string;bridgeMinimumUnits:string;tool:'squid'|'layerswap'}

/** Narrow LI.FI fallback: only the verified Celo cNGN -> Base USDC Squid path.
 * It fails closed if LI.FI changes its route shape, fee model, or call targets. */
export function validateCrossBridgeLifiQuote(q:CrossBridgeLifiQuote,i:CrossBridgeInput,now=Date.now(),revenue?:PocketBridgeRevenue){
 if(i.source==='base'&&i.destination==='celo'&&(i.from==='cNGN'||i.from==='USDC')&&i.to==='cNGN'&&i.purpose===undefined)return validateBaseCeloCngnLifiQuote(q,i,now,revenue)
 const fail=()=>invalid()
 if(revenue)return fail()
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

/** Verify the Base cNGN -> USDC -> LayerSwap -> Celo cNGN route. The provider
 * quote is untrusted input: pin both token deployments, router targets,
 * recipient, bridge destination, fixed fee, swap assets and refund owner. */
function validateBaseCeloCngnLifiQuote(q:CrossBridgeLifiQuote,i:CrossBridgeInput,now:number,revenue?:PocketBridgeRevenue){
 const fail=()=>invalid(),payload=q.response as any,route=payload?.route,step=payload?.step,a=step?.action,e=step?.estimate,t=step?.transactionRequest
 if(!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt<=now||q.expiresAt-q.issuedAt>45000)return fail()
 const direct=i.from==='USDC',inputToken=direct?BASE_USDC:BASE_CNGN
 const amount=BigInt(i.amountUnits)
 if(payload?.mode!=='base-celo-layerswap'||!route||!step||step.type!=='lifi'||step.tool!=='layerswap'||route.steps?.length!==1||route.steps[0]?.tool!=='layerswap')return fail()
 if(route.fromChainId!==8453||route.toChainId!==42220||route.fromAmount!==i.amountUnits||!same(route.fromToken?.address,inputToken)||!same(route.toToken?.address,CNGN)||!units(route.toAmount)||!units(route.toAmountMin)||BigInt(route.toAmountMin)>BigInt(route.toAmount))return fail()
 if(a?.fromChainId!==8453||a?.toChainId!==42220||!same(a.fromAddress,i.sender)||!same(a.toAddress,i.recipient)||!same(a.fromToken?.address,inputToken)||a.fromToken?.decimals!==6||a.fromAmount!==i.amountUnits||!same(a.toToken?.address,CNGN)||a.toToken?.decimals!==6)return fail()
 if(e?.tool!=='layerswap'||e.fromAmount!==i.amountUnits||!units(e.toAmount)||!units(e.toAmountMin)||BigInt(e.toAmountMin)>BigInt(e.toAmount))return fail()
 if(t?.chainId!==8453||!same(t.from,i.sender)||!same(t.to,DIAMOND)||!hex(t.data)||BigInt(t.value||'0')!==0n)return fail()
 const fees=e.feeCosts
 if(!Array.isArray(fees))return fail()
 const fee=fees.find((x:any)=>x.name==='LIFI Fixed Fee'&&x.included===true&&same(x.token?.address,inputToken))
 const expectedRevenue=revenue?BigInt(revenue.amountUnits):0n,distributionFee=fees.find((x:any)=>x.name==='Distributions'&&x.included===true&&same(x.token?.address,inputToken))
 const bridgeFee=fees.find((x:any)=>x.name==='LayerSwap fee'&&x.included===true&&same(x.token?.address,BASE_USDC))
 if(!fee||!units(fee.amount)||BigInt(fee.amount)!==amount*25n/10000n||fee.feeSplit?.integratorFee!=='0'||fee.feeSplit?.lifiFee!==String(fee.amount)||fee.feeSplit?.recipients?.length!==1||fee.feeSplit.recipients[0]?.name!=='lifi'||fee.feeSplit.recipients[0]?.fee!==String(fee.amount))return fail()
 if(revenue&&expectedRevenue>0n){if(!distributionFee||!units(distributionFee.amount)||BigInt(distributionFee.amount)!==expectedRevenue||distributionFee.feeSplit?.recipients?.length!==1||!same(distributionFee.feeSplit.recipients[0]?.walletAddress,revenue.recipient)||distributionFee.feeSplit.recipients[0]?.fee!==String(expectedRevenue))return fail()}
 else if(distributionFee||fees.some((x:any)=>x.name==='Distributions'))return fail()
 if(fees.length!==(expectedRevenue>0n?3:2)||fees.some((x:any)=>!['LIFI Fixed Fee','LayerSwap fee','Distributions'].includes(x.name)||x.included!==true))return fail()
 if(!bridgeFee||!units(bridgeFee.amount)||!Number.isFinite(Number(bridgeFee.amountUSD))||Number(bridgeFee.amountUSD)<=0)return fail()
 let decoded:any
 try{decoded=decodeFunctionData({abi:lifiAbi,data:t.data})}catch{return fail()}
 if(decoded.functionName!=='swapAndStartBridgeTokensViaLayerSwap')return fail()
 const [bridge,swaps,layer]=decoded.args as any
 if(bridge.transactionId===undefined||!/^0x[0-9a-f]{64}$/i.test(bridge.transactionId)||!same(bridge.bridge,'layerswap')||bridge.integrator!=='hashpaylink'||!same(bridge.sendingAssetId,BASE_USDC)||!same(bridge.receiver,i.recipient)||bridge.destinationChainId!==42220n||bridge.hasSourceSwaps!==true||bridge.hasDestinationCall!==false||!units(String(bridge.minAmount)))return fail()
 if(!same(layer.refundRecipient,i.sender)||!/^0x[0-9a-f]{64}$/i.test(layer.requestId)||!/^0x[0-9a-f]{64}$/i.test(layer.nonEVMReceiver)||!/^0x0{64}$/i.test(layer.nonEVMReceiver)||!/^0x[0-9a-f]{130}$/i.test(layer.signature)||!Number.isSafeInteger(Number(layer.deadline))||Number(layer.deadline)*1000<=now||!/^0x[0-9a-f]{40}$/i.test(layer.depositoryReceiver)||/^0x0{40}$/i.test(layer.depositoryReceiver))return fail()
 if(!Array.isArray(swaps)||swaps.length!==(direct?1:2))return fail()
 const feeSwap=swaps[0],swap=swaps[1]
 if(!same(feeSwap.callTo,BASE_FEE_FORWARDER)||!same(feeSwap.approveTo,BASE_FEE_FORWARDER)||!same(feeSwap.sendingAssetId,inputToken)||!same(feeSwap.receivingAssetId,inputToken)||feeSwap.fromAmount!==amount||!feeSwap.requiresDeposit)return fail()
 let feeCall:any
 try{feeCall=decodeFunctionData({abi:lifiAbi,data:feeSwap.callData})}catch{return fail()}
 const [feeToken,distributions]=feeCall.args as any
 if(feeCall.functionName!=='forwardERC20Fees'||!same(feeToken,inputToken)||!Array.isArray(distributions)||distributions.length!==(expectedRevenue>0n?2:1))return fail()
 const providerDistributions=distributions.filter((d:any)=>same(d.recipient,LIFI_FEE_RECIPIENT)&&d.amount===BigInt(fee.amount))
 if(providerDistributions.length!==1)return fail()
 try{if(revenue)assertPocketBridgeRevenue(amount,revenue,distributions)}catch{return fail()}
 if(direct){
  if(bridge.minAmount!==amount-BigInt(fee.amount)-expectedRevenue)return fail()
 }else{
  if(!same(swap.callTo,BASE_ONEINCH_ROUTER)||!same(swap.approveTo,BASE_ONEINCH_ROUTER)||!same(swap.sendingAssetId,inputToken)||!same(swap.receivingAssetId,BASE_USDC)||swap.fromAmount!==amount-distributions.reduce((sum:bigint,d:any)=>sum+d.amount,0n)||swap.requiresDeposit)return fail()
  let oneInch:any
  try{oneInch=decodeFunctionData({abi:oneInchAbi,data:swap.callData})}catch{return fail()}
  const [executor,desc]=oneInch.args as any
  // LI.FI's live quote currently rounds the 1inch minimum one base-unit below
  // bridgeData.minAmount. Permit only that single-unit discrepancy; larger gaps
  // could make a minimum-output fill unusable by the bridge call.
  if(oneInch.functionName!=='swap'||!same(executor,BASE_ONEINCH_EXECUTOR)||!same(desc.srcToken,inputToken)||!same(desc.dstToken,BASE_USDC)||!same(desc.srcReceiver,BASE_ONEINCH_EXECUTOR)||!same(desc.dstReceiver,DIAMOND)||desc.amount!==swap.fromAmount||desc.minReturnAmount>BigInt(bridge.minAmount)||BigInt(bridge.minAmount)-desc.minReturnAmount>1n||desc.flags!==0n)return fail()
 }
 // The advanced route is a selection preview; stepTransaction returns the
 // executable quote and can legitimately reprice before producing calldata.
 // Only its executable estimate is displayed and used below.
 if(!same(e.approvalAddress,DIAMOND)||!units(e.toAmount)||!units(e.toAmountMin))return fail()
 const approve=(n:bigint)=>({target:inputToken as Address,value:0n,data:encodeFunctionData({abi:squidAbi,functionName:'approve',args:[DIAMOND as Address,n]})})
 const calls=[approve(0n),approve(amount),{target:DIAMOND as Address,value:0n,data:t.data as Hex},approve(0n)]
 const execution={kind:'evm' as const,calls,callData:encodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),functionName:'executeBatch',args:[calls]})}
 const tokenIn=crossBridgeAsset('base',i.from),tokenOut=crossBridgeAsset('celo','cNGN'),refundOptions=[{network:'base' as const,asset:i.from,address:inputToken,decimals:6,recipient:i.sender},{network:'celo' as const,asset:'cNGN',address:CNGN,decimals:6,recipient:i.recipient}]
 return {provider:'lifi' as const,platformFee:{provider:'lifi',amount:String(fee.amount)},orderId:bridge.transactionId as Hex,requestId:bridge.transactionId as Hex,source:i.source,destination:i.destination,tokenIn,tokenOut,amountUnits:i.amountUnits,receiveUnits:String(e.toAmount),minimumUnits:String(e.toAmountMin),expiresAt:q.expiresAt,refundOptions,execution,lifi:{transactionId:bridge.transactionId as Hex,providerFeeUnits:String(fee.amount),providerFeeUsd:String(bridgeFee.amountUSD),...(expectedRevenue>0n?{integratorFeeUnits:String(expectedRevenue)}:{}),nativeValueUnits:'0',bridgeTokenAddress:BASE_USDC,bridgeMinimumUnits:String(bridge.minAmount),tool:'layerswap' as const}}
}

export async function fetchCrossBridgeLifiReview(i:CrossBridgeInput,fetcher=fetch,now=Date.now,revenue?:PocketBridgeRevenue){
 if(i.source==='base'&&i.destination==='celo'&&(i.from==='cNGN'||i.from==='USDC')&&i.to==='cNGN'&&i.purpose===undefined)return fetchBaseCeloCngnLifiReview(i,fetcher,now,revenue)
 const requestedAt=now(),params=new URLSearchParams({fromChain:'42220',toChain:'8453',fromToken:CNGN,toToken:BASE_USDC,fromAmount:i.amountUnits,fromAddress:i.sender,toAddress:i.recipient,slippage:'0.005',allowBridges:'squid',allowExchanges:'nordstern'})
 const response=await fetcher('https://li.quest/v1/quote?'+params,{headers:process.env.LIFI_API_KEY?{'x-lifi-api-key':process.env.LIFI_API_KEY}:{},redirect:'error',signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Object.assign(Error('Jumper could not find a route right now. Try again later.'),{status:response.status===429?429:503,code:response.status===429?'rate_limited':'lifi_route_unavailable'})
 const body=await response.json(),quote:CrossBridgeLifiQuote={kind:'lifi-cross-bridge',response:body,issuedAt:requestedAt,expiresAt:requestedAt+30000},route=validateCrossBridgeLifiQuote(quote,i,requestedAt)
 if(route.expiresAt<=now())throw Error('Bridge quote expired. Review again.')
 return {providerQuote:quote,route,requestedAt}
}

async function fetchBaseCeloCngnLifiReview(i:CrossBridgeInput,fetcher:typeof fetch,now:()=>number,revenue?:PocketBridgeRevenue){
 const inputToken=i.from==='USDC'?BASE_USDC:BASE_CNGN
 const requestedAt=now(),headers={'content-type':'application/json',...(process.env.LIFI_API_KEY?{'x-lifi-api-key':process.env.LIFI_API_KEY}:{})}
 const body={fromChainId:8453,fromTokenAddress:inputToken,fromAmount:i.amountUnits,toChainId:42220,toTokenAddress:CNGN,fromAddress:i.sender,toAddress:i.recipient,options:{integrator:'hashpaylink',fee:0, ...(revenue&&BigInt(revenue.amountUnits)>0n?{distributionFees:[{receiver:revenue.recipient,percentage:revenue.bps/10000}]}:{}),slippage:0.005,allowSwitchChain:false,bridges:{allow:['layerswap']}}}
 const response=await fetcher('https://li.quest/v1/advanced/routes',{method:'POST',headers,body:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)})
 if(!response.ok)throw Object.assign(Error('Jumper could not find a route right now. Try again later.'),{status:response.status===429?429:503,code:response.status===429?'rate_limited':'lifi_route_unavailable'})
 const result:any=await response.json(),candidates=Array.isArray(result?.routes)?result.routes.filter((r:any)=>r?.steps?.length===1&&r.steps[0]?.tool==='layerswap'&&r.fromAmount===i.amountUnits&&r.fromChainId===8453&&r.toChainId===42220&&same(r.fromToken?.address,inputToken)&&same(r.toToken?.address,CNGN)):[]
 if(!candidates.length)throw Object.assign(Error('No route is available for this token pair right now.'),{status:422,code:'route_unavailable'})
 const route=candidates[0],stepResponse=await fetcher('https://li.quest/v1/advanced/stepTransaction',{method:'POST',headers,body:JSON.stringify(route.steps[0]),redirect:'error',signal:AbortSignal.timeout(20000)})
 if(!stepResponse.ok)throw Object.assign(Error('Jumper could not prepare this route right now. Try again later.'),{status:stepResponse.status===429?429:503,code:stepResponse.status===429?'rate_limited':'lifi_route_unavailable'})
 const step=await stepResponse.json(),quote:CrossBridgeLifiQuote={kind:'lifi-cross-bridge',response:{mode:'base-celo-layerswap',route,step},issuedAt:requestedAt,expiresAt:requestedAt+30000},validated=validateCrossBridgeLifiQuote(quote,i,requestedAt,revenue)
 if(validated.expiresAt<=now())throw Error('Bridge quote expired. Review again.')
 return {providerQuote:quote,route:validated,requestedAt}
}
