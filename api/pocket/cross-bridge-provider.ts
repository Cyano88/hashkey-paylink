import {crossBridgeSolanaNativeDeposit} from './cross-bridge-solana-native.js'
import {validateNativeBridgeConversion} from './cross-bridge-evm-conversion.js'
import {validateXLayerConversion} from './cross-bridge-xlayer-conversion.js'
import {validateEurcConversion,type EurcConversion} from './cross-bridge-eurc-conversion.js'
import {relayBridgeAppFee,relayBridgeAppFeeRequest,validateRelayBridgeAppFeeQuote,type RelayBridgeAppFee} from './relay-bridge-app-fee.js'
import {getOrderId,type Order} from '@relay-protocol/settlement-sdk'
import {PublicKey} from '@solana/web3.js'
import {decodeFunctionData,encodeFunctionData,parseAbi,type Address,type Hex} from 'viem'
import {assertCrossBridgeRollout,crossBridgePair,crossBridgeAsset,crossBridgeAssets,CROSS_BRIDGE_NATIVE_ADDRESS,type CrossBridgeNetwork} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {RELAY_BSC_CHAINS,bscRelaySolanaDeposit} from './bsc-bridge-provider.js'

export type CrossBridgeInput={source:CrossBridgeNetwork;destination:CrossBridgeNetwork;from:string;to:string;sender:string;recipient:string;amountUnits:string}
export type CrossBridgeRefund={network:CrossBridgeNetwork;asset:string;address:string;decimals:number;recipient:string}
export const crossBridgeDepositAbi=parseAbi(['function depositNative(address depositor,bytes32 id) payable','function depositErc20(address depositor,address token,uint256 amount,bytes32 id)'])
const approveAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
const batchAbi=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const vmTypes={bnb:'ethereum-vm',xlayer:'ethereum-vm',ethereum:'ethereum-vm',polygon:'ethereum-vm',arc:'ethereum-vm',base:'ethereum-vm',arbitrum:'ethereum-vm',solana:'solana-vm'} as const
const protocolChain=(n:CrossBridgeNetwork)=>n==='bsc'?'bnb':n
const same=(n:CrossBridgeNetwork,a:unknown,b:string)=>typeof a==='string'&&(n==='solana'?a===b:a.toLowerCase()===b.toLowerCase())
const requireThat=(condition:unknown,message:string)=>{if(!condition)throw Error('Bridge quote: '+message)}
const positiveUnits=(v:unknown):v is string=>typeof v==='string'&&/^[1-9]\d{0,38}$/.test(v)&&BigInt(v)<2n**128n
function checkInput(i:CrossBridgeInput){
 const tokens=crossBridgePair(i.source,i.destination,i.from,i.to)
 requireThat(positiveUnits(i.amountUnits)&&(i.source!=='solana'||BigInt(i.amountUnits)<2n**64n),'invalid amount')
 for(const [network,address] of [[i.source,i.sender],[i.destination,i.recipient]])requireThat(typeof address==='string'&&(network==='solana'?new PublicKey(address).toBase58()===address&&!new PublicKey(address).equals(PublicKey.default):/^0x[0-9a-fA-F]{40}$/.test(address)&&!/^0x0{40}$/.test(address)),'invalid wallet')
 return tokens
}
export function crossBridgeRelayRequest(i:CrossBridgeInput,appFee?:RelayBridgeAppFee|null){
 const {tokenIn,tokenOut}=checkInput(i)
 return {user:i.sender,recipient:i.recipient,refundTo:i.sender,originChainId:RELAY_BSC_CHAINS[i.source].id,destinationChainId:RELAY_BSC_CHAINS[i.destination].id,originCurrency:tokenIn.address,destinationCurrency:tokenOut.address,amount:i.amountUnits,tradeType:'EXACT_INPUT',slippageTolerance:'49',explicitDeposit:true,disableOriginSwaps:true,includeProtocolData:true,appFees:relayBridgeAppFeeRequest(appFee)}
}
/** No signing or broadcasting. Keep this separate from the existing same-asset adapters. */
function validateDirectCrossBridgeRelayQuote(q:any,i:CrossBridgeInput,now=Date.now(),appFee?:RelayBridgeAppFee|null){
 const {tokenIn,tokenOut}=checkInput(i),source=RELAY_BSC_CHAINS[i.source],destination=RELAY_BSC_CHAINS[i.destination],amount=BigInt(i.amountUnits)
 const protocol=q?.protocol?.v2,order=protocol?.orderData as Order
 requireThat(protocol?.hubType==='onchain'&&order?.version==='v1'&&order.inputs?.length===1&&order.output?.payments?.length===1&&order.output.calls?.length===0&&order.fees?.length===0,'unsupported order')
 const platformFee=validateRelayBridgeAppFeeQuote(q,i.source,tokenIn,i.amountUnits,appFee)
 const input=order.inputs[0].payment,output=order.output.payments[0]
 requireThat(input.chainId===protocolChain(i.source)&&same(i.source,input.currency,tokenIn.address)&&input.amount===i.amountUnits&&input.weight==='1','input mismatch')
 requireThat(order.output.chainId===protocolChain(i.destination)&&same(i.destination,output.recipient,i.recipient)&&same(i.destination,output.currency,tokenOut.address),'output mismatch')
 requireThat(positiveUnits(output.expectedAmount)&&positiveUnits(output.minimumAmount),'invalid output amount')
 const receive=BigInt(output.expectedAmount),minimum=BigInt(output.minimumAmount)
 // Different assets have different values as well as different decimals. Bind the
 // exact quoted amounts and slippage, never a fictitious one-to-one conversion.
 requireThat(minimum<=receive&&minimum>=receive*9950n/10000n,'slippage mismatch')
 requireThat(Number.isSafeInteger(order.output.deadline)&&order.output.deadline*1000>now+45000&&order.output.deadline*1000<now+8*86400000,'invalid deadline')
 const refunds=order.inputs[0].refunds
 requireThat(refunds?.length===2&&new Set(refunds.map(r=>r.chainId)).size===2,'unexpected refunds')
 const refundOptions:CrossBridgeRefund[]=refunds.map(r=>{
  const origin=r.chainId===protocolChain(i.source),network=origin?i.source:i.destination
  requireThat(origin||r.chainId===protocolChain(i.destination),'unexpected refund chain')
  const candidates=origin?[tokenIn]:crossBridgeAssets(network)
  const token=candidates.find(t=>same(network,r.currency,t.address))
  requireThat(token&&same(network,r.recipient,origin?i.sender:i.recipient)&&r.minimumAmount==='0'&&r.deadline===order.output.deadline,'refund mismatch')
  return {network,asset:token!.symbol,address:token!.address,decimals:token!.decimals,recipient:origin?i.sender:i.recipient}
 })
 const details=protocol.paymentDetails
 requireThat(details?.chainId===protocolChain(i.source)&&same(i.source,details.depository,source.depository)&&same(i.source,details.currency,tokenIn.address)&&details.amount===i.amountUnits,'depository mismatch')
 const orderId=getOrderId(order,vmTypes) as Hex
 requireThat(same('base',protocol.orderId,orderId),'order hash mismatch')
 for(const [shown,token,network,units] of [[q.details?.currencyIn,tokenIn,i.source,i.amountUnits],[q.details?.currencyOut,tokenOut,i.destination,output.expectedAmount]] as const)requireThat(shown?.amount===units&&same(network,shown?.currency?.address,token.address)&&shown.currency.chainId===RELAY_BSC_CHAINS[network].id&&shown.currency.decimals===token.decimals,'display mismatch')
 requireThat(Array.isArray(q.steps)&&q.steps.length>=1&&q.steps.length<=2&&q.steps.every((s:any)=>s.kind==='transaction'&&s.items?.length===1&&!s.depositAddress)&&q.steps.filter((s:any)=>s.id==='deposit').length===1,'unsupported steps')
 const deposit=q.steps.find((s:any)=>s.id==='deposit'),requestId=deposit.requestId
 requireThat(typeof requestId==='string'&&/^0x[0-9a-fA-F]{64}$/.test(requestId)&&(!q.requestId||q.requestId===requestId)&&q.steps.every((s:any)=>!s.requestId||s.requestId===requestId),'invalid recovery identifier')
 requireThat(deposit.items[0].check?.method==='GET'&&deposit.items[0].check?.endpoint==='/intents/status/v3?requestId='+requestId,'unexpected recovery endpoint')
 let execution
 if(i.source==='solana'){
  requireThat(q.steps.length===1&&(i.from==='SOL'||i.from==='USDC'||i.from==='USDT'),'unsupported Solana deposit')
  const expected=i.from==='SOL'?crossBridgeSolanaNativeDeposit(i.sender,amount,orderId):bscRelaySolanaDeposit(i.sender,amount,orderId,i.from as 'USDC'|'USDT'),data=deposit.items[0].data,ix=data?.instructions?.[0]
  requireThat(data?.instructions?.length===1&&ix?.programId===expected.programId.toBase58()&&ix.data===expected.data.toString('hex')&&ix.keys?.length===expected.keys.length,'Solana deposit mismatch')
  expected.keys.forEach((k,n)=>requireThat(ix.keys[n].pubkey===k.pubkey.toBase58()&&ix.keys[n].isSigner===k.isSigner&&ix.keys[n].isWritable===k.isWritable,'Solana account mismatch'))
  execution={kind:'solana' as const,instruction:expected}
 }else{
  requireThat(q.steps.every((s:any)=>s.id==='deposit'||!tokenIn.native&&s.id==='approve')&&(!tokenIn.native||q.steps.length===1),'unexpected EVM steps')
  const depositData=encodeFunctionData({abi:crossBridgeDepositAbi,functionName:tokenIn.native?'depositNative':'depositErc20',args:tokenIn.native?[i.sender as Address,orderId]:[i.sender as Address,tokenIn.address as Address,amount,orderId]})
  for(const step of q.steps){
   const tx=step.items[0].data
   requireThat(tx?.chainId===source.id&&same(i.source,tx.from,i.sender)&&BigInt(tx.value||0)===(step.id==='deposit'&&tokenIn.native?amount:0n),'transaction sender/chain/value mismatch')
   if(step.id==='approve'){
    const c=decodeFunctionData({abi:approveAbi,data:tx.data})
    requireThat(same(i.source,tx.to,tokenIn.address)&&same(i.source,c.args[0],source.depository)&&c.args[1]===amount&&tx.data.toLowerCase()===encodeFunctionData({abi:approveAbi,functionName:'approve',args:c.args}).toLowerCase(),'approval mismatch')
   }else{
    const c=decodeFunctionData({abi:crossBridgeDepositAbi,data:tx.data})
    requireThat(same(i.source,tx.to,source.depository)&&(same(i.source,c.args[0],i.sender)||same(i.source,c.args[0],CROSS_BRIDGE_NATIVE_ADDRESS)),'deposit recipient mismatch')
    if(tokenIn.native)requireThat(c.functionName==='depositNative'&&same('base',c.args[1],orderId),'native deposit mismatch')
    else requireThat(c.functionName==='depositErc20'&&same(i.source,c.args[1],tokenIn.address)&&c.args[2]===amount&&same('base',c.args[3],orderId),'token deposit mismatch')
    requireThat(tx.data.toLowerCase()===encodeFunctionData({abi:crossBridgeDepositAbi,functionName:c.functionName,args:c.args} as any).toLowerCase(),'noncanonical deposit data')
   }
  }
  const depositCall={target:source.depository as Address,value:tokenIn.native?amount:0n,data:depositData}
  const approve=(value:bigint)=>({target:tokenIn.address as Address,value:0n,data:encodeFunctionData({abi:approveAbi,functionName:'approve',args:[source.depository as Address,value]})})
  const calls=tokenIn.native?[depositCall]:[approve(0n),approve(amount),depositCall,approve(0n)]
  execution={kind:'evm' as const,calls,callData:encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[calls]})}
 }
 return {provider:'relay' as const,platformFee,orderId,requestId,source:i.source,destination:i.destination,tokenIn,tokenOut,amountUnits:i.amountUnits,receiveUnits:output.expectedAmount,minimumUnits:output.minimumAmount,expiresAt:Math.min(now+45000,order.output.deadline*1000),refundOptions,execution}
}
export type CrossBridgeRoute=ReturnType<typeof validateDirectCrossBridgeRelayQuote>&{conversion?:ReturnType<typeof validateEurcConversion>}
export function validateCrossBridgeRelayQuote(q:any,i:CrossBridgeInput,now=Date.now(),appFee?:RelayBridgeAppFee|null):CrossBridgeRoute {
 if(q?.kind!=='eurc-conversion'&&q?.kind!=='xlayer-conversion'&&q?.kind!=='evm-conversion')return validateDirectCrossBridgeRelayQuote(q,i,now,appFee)
 const conversion=q.kind==='evm-conversion'?validateNativeBridgeConversion(q.swap,i,now):q.kind==='xlayer-conversion'?validateXLayerConversion(q.swap,i,now):validateEurcConversion(q.swap as EurcConversion,i,now)
 const bridge=validateDirectCrossBridgeRelayQuote(q.bridge,{...i,from:'USDC',amountUnits:conversion.minimumUnits},now,appFee)
 if(bridge.execution.kind!=='evm')throw Error('Invalid converted bridge execution.')
 const calls=[...conversion.calls,...bridge.execution.calls]
 return {...bridge,tokenIn:crossBridgeAsset(i.source,i.from),amountUnits:i.amountUnits,expiresAt:Math.min(bridge.expiresAt,conversion.expiresAt),conversion,execution:{kind:'evm',calls,callData:encodeFunctionData({abi:batchAbi,functionName:'executeBatch',args:[calls]})}}
}
export async function fetchCrossBridgeRelayReview(i:CrossBridgeInput,apiKey:string,fetcher=fetch,appFee:RelayBridgeAppFee|null=relayBridgeAppFee(),now=Date.now){
 assertCrossBridgeRollout(i.source,i.destination)
 requireThat(apiKey.trim().length>0,'provider API key required')
 const requestedAt=now()
 const response=await fetcher('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json','x-api-key':apiKey},body:JSON.stringify(crossBridgeRelayRequest(i,appFee)),signal:AbortSignal.timeout(20000)})
 if(!response.ok){
  const failure=await response.json().catch(()=>null),inputError=[400,422].includes(response.status)
  const tooSmall=inputError&&failure?.errorCode==='AMOUNT_TOO_LOW',noRoute=inputError&&failure?.errorCode==='NO_SWAP_ROUTES_FOUND'
  throw Object.assign(Error(tooSmall?'Amount too small.':noRoute?'No route is available for this token pair. Try another token or network.':response.status===429?'Bridge service is busy. Try again shortly.':'This bridge route is currently unavailable.'),{status:tooSmall||noRoute?422:response.status===429?429:503,code:tooSmall?'amount_too_low':noRoute?'route_unavailable':response.status===429?'rate_limited':'provider_unavailable',retryAfter:response.status===429?Math.max(1,Math.min(300,Number(response.headers.get('Retry-After'))||60)):undefined})
 }
 const providerQuote=await response.json(),route=validateCrossBridgeRelayQuote(providerQuote,i,requestedAt,appFee)
 if(route.expiresAt<=now())throw Error('Bridge quote expired. Review again.')
 return {providerQuote,route,requestedAt}
}

export async function quoteCrossBridgeRelay(i:CrossBridgeInput,apiKey:string,fetcher=fetch,appFee:RelayBridgeAppFee|null=relayBridgeAppFee()){
 return (await fetchCrossBridgeRelayReview(i,apiKey,fetcher,appFee)).route
}
