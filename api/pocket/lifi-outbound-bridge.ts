import {decodeEventLog,decodeFunctionData,type Address,type Hex} from 'viem'
import {lifiAbi,LIFI_DIAMOND,validateLifiPlan,type LifiOutboundPlan,type LifiDestination} from '../../src/pocket/lib/pocketLifiOutbound.js'
import {POCKET_USDT_ASSETS} from '../../src/pocket/lib/pocketUsdtAssets.js'
import {evmStablecoinDelta} from './xlayer-bridge-evidence.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
const sourceToken='0x779ded0c9e1022225f8e0630b35a9b54be713736'
const same=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const fail=(message:string):never=>{throw Object.assign(Error(message),{status:503})}
export async function quoteLifiOutbound(input:{destination:LifiDestination;owner:Address;recipient:Address;amountUnits:string},fetcher=fetch){
 const target=POCKET_USDT_ASSETS[input.destination]
 const params=new URLSearchParams({fromChain:'196',toChain:String(target.chainId),fromToken:sourceToken,toToken:target.address,fromAmount:input.amountUnits,fromAddress:input.owner,toAddress:input.recipient,slippage:'0.005','allowBridges':'layerswap'})
 const r=await fetcher('https://li.quest/v1/quote?'+params,{signal:AbortSignal.timeout(20000),redirect:'error'}),b=await r.json()
 if(!r.ok||!b.transactionRequest)fail('No USDT0 route is available for this amount. Try another destination or amount.')
 const a=b.action,t=b.transactionRequest,e=b.estimate
 if(b.tool!=='layerswap'||a?.fromChainId!==196||a?.toChainId!==target.chainId||!same(a.fromAddress,input.owner)||!same(a.toAddress,input.recipient)||!same(a.fromToken?.address,sourceToken)||!same(a.toToken?.address,target.address)||a.fromToken?.decimals!==6||a.toToken?.decimals!==6||a.fromAmount!==input.amountUnits||e?.fromAmount!==input.amountUnits||!same(e.approvalAddress,LIFI_DIAMOND)||t.chainId!==196||!same(t.from,input.owner)||!same(t.to,LIFI_DIAMOND)||BigInt(t.value)!==0n)fail('This bridge route could not be verified. Try again.')
 const decoded=decodeFunctionData({abi:lifiAbi,data:t.data}),args=decoded.args as any
 const p:LifiOutboundPlan={...input,receiveUnits:e.toAmount,minimumUnits:e.toAmountMin,transactionId:args[0].transactionId,data:t.data,expiresAt:Math.min(Date.now()+30000,Number(args[decoded.functionName==='swapAndStartBridgeTokensViaLayerSwap'?2:1].deadline)*1000)}
 validateLifiPlan(p);return p
}
export function lifiSourceProven(p:LifiOutboundPlan,feeUnits:string,receipt:any,hash:Hex){
 if(evmStablecoinDelta(receipt,'xlayer','USDT',p.owner,hash)!==-(BigInt(p.amountUnits)+BigInt(feeUnits))||evmStablecoinDelta(receipt,'xlayer','USDT',EVM_PLATFORM_TREASURY,hash)!==BigInt(feeUnits))return false
 const expected=validateLifiPlan(p,p.expiresAt-1).bridgeData
 const matches=receipt.logs.filter((l:any)=>{
  if(l.removed||!same(l.address,LIFI_DIAMOND))return false
  try{const {args}=decodeEventLog({abi:lifiAbi,eventName:'LiFiTransferStarted',data:l.data,topics:l.topics});const b=args.bridgeData;return same(b.transactionId,p.transactionId)&&same(b.receiver,p.recipient)&&same(b.sendingAssetId,sourceToken)&&b.minAmount===expected.minAmount&&b.destinationChainId===expected.destinationChainId&&b.bridge==='layerswap'}catch{return false}
 });return matches.length===1
}
export async function lifiDelivery(p:LifiOutboundPlan,hash:Hex,receipt:(network:any,hash:Hex)=>Promise<any>,fetcher=fetch){
 const waiting={status:'pending' as const,sourceConfirmed:true},attention={status:'needs_attention' as const,sourceConfirmed:true}
 const r=await fetcher('https://li.quest/v1/status?'+new URLSearchParams({txHash:hash,fromChain:'196',toChain:String(POCKET_USDT_ASSETS[p.destination].chainId),bridge:'layerswap'}),{signal:AbortSignal.timeout(15000),redirect:'error'})
 if(!r.ok)return waiting
 const response=await r.json()
 // Sponsored ERC-4337 transactions are submitted by a bundler. LI.FI's outer
 // fromAddress describes that transaction; select the unique bridge operation.
 // The caller already proved its exact source event, owner debit and fee.
 let b=response
 if(Array.isArray(response.batchStatus)){
  const matches=response.batchStatus.filter((item:any)=>same(item.transactionId,p.transactionId))
  if(matches.length!==1)return attention
  b=matches[0]
 }
 if(['PENDING','NOT_FOUND'].includes(b.status))return waiting
 if(!same(b.transactionId,p.transactionId)||!same(b.sending?.txHash,hash)||b.sending?.chainId!==196||!same(b.sending?.token?.address,sourceToken)||!same(b.fromAddress,p.owner)||!same(b.toAddress,p.recipient)||b.tool!=='layerswap')return attention
 // A provider failure alone never proves a refund or permits a second submission.
 if(b.status!=='DONE'||!['COMPLETED','REFUNDED'].includes(b.substatus))return attention
 const refund=b.substatus==='REFUNDED',network=refund?'xlayer':p.destination,target=refund?sourceToken:POCKET_USDT_ASSETS[p.destination].address,owner=refund?p.owner:p.recipient
 if(b.receiving?.chainId!==(refund?196:POCKET_USDT_ASSETS[p.destination].chainId)||!same(b.receiving?.token?.address,target)||!/^0x[0-9a-f]{64}$/i.test(b.receiving?.txHash))return attention
 const delivered=await receipt(network,b.receiving.txHash);if(!delivered)return waiting
 const delta=evmStablecoinDelta(delivered,network,'USDT',owner,b.receiving.txHash)
 if(delta===null||delta<=0n||refund&&delta>BigInt(p.amountUnits)||!refund&&delta<BigInt(p.minimumUnits))return attention
 return {status:refund?'refunded' as const:'completed' as const,destinationTxHash:b.receiving.txHash,sourceConfirmed:true,...(refund?{refundAsset:'USDT',refundNetwork:'xlayer',refundAmount:(Number(delta)/1e6).toString()}:{})}
}
