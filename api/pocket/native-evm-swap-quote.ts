import {COMPACT_V3_ABI,validateEthereumCompactSwap} from './native-ethereum-compact-swap.js'
﻿import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {decodeFunctionData,encodeFunctionData,formatUnits,getAddress,isAddress,parseAbi,type Abi,type Hex} from 'viem'
import routerAbi from '../../src/pocket/lib/pocketOkxRouterAbi.json' with {type:'json'}
import {readStockSwapFee} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {bufferedNativeFee,nativeAmountUnits,nativeEvmNetworks,type NativeEvmNetwork} from './native-send-quote.js'
import {nativeSwapUnits,quoteNativeSwap} from './native-swap-quote.js'
import {okxGet} from './xstocks-swap-provider.js'
// Reviewed against OKX contract documentation. API-returned addresses must match before use.
export const NATIVE_SWAP_CONTRACTS={
 ethereum:{router:'0x8feab81d36e7576107d5de0758c1b839be31b4f6',spender:'0x40aA958dd87FC8305b97f2BA922CDdCa374bcD7f'},
 base:{router:'0x67d03631fe51b741c0c00c4e16eb662ac84381df',spender:'0x57df6092665eb6058DE53939612413ff4B09114E'},
 arbitrum:{router:'0x09f94b5fc68e227c323a6fbae3bd98c97fd8c849',spender:'0x70cBb871E8f30Fc8Ce23609E9E0Ea87B6b222f58'},
 polygon:{router:'0x3c4829196bfadff4394726b45159aeaac6fcd41c',spender:'0x3B86917369B83a6892f553609F3c2F439C184e31'},
} as const
export const NATIVE_SWAP_BATCH_ABI=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const swapAbi=[...routerAbi,...COMPACT_V3_ABI] as Abi
const approveAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
export type NativeEvmSwapBinding={ownerId:string;walletId:string;walletAddress:Hex;network:NativeEvmNetwork;from:string;to:string;amount:string}
export type NativeEvmSwapQuote=NativeEvmSwapBinding&{version:1;id:string;amountUnits:string;outputUsdPrice?:number;expectedOutUnits:string;minimumOutUnits:string;priceImpact:string;tx:{from:Hex;to:Hex;data:Hex;value:string};spender:Hex;feeUnits:string;callData:Hex;issuedAt:number;expiresAt:number;positiveSlippageFee?:{capPercent:number;recipient:Hex}}
const fail=()=>{throw Object.assign(Error('Swap details changed. Review the amount and fee again.'),{status:409})}
export const sameSwapAddress=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
export function nativeSwapCalls(q:NativeEvmSwapQuote,fee=BigInt(q.feeUnits)){
 const {tokenIn}=nativeSwapPair(q.network,q.from,q.to)
 const approval=(amount:bigint)=>({target:getAddress(tokenIn.address),value:0n,data:encodeFunctionData({abi:approveAbi,functionName:'approve',args:[q.spender,amount]})})
 return [...(tokenIn.native?[]:[approval(0n),approval(BigInt(q.amountUnits))]),{target:q.tx.to,value:BigInt(q.tx.value),data:q.tx.data},...(tokenIn.native?[]:[approval(0n)]),{target:getAddress(EVM_PLATFORM_TREASURY),value:fee,data:'0x' as Hex}]
}
export function nativeSwapBatch(q:NativeEvmSwapQuote,fee=BigInt(q.feeUnits)){return encodeFunctionData({abi:NATIVE_SWAP_BATCH_ABI,functionName:'executeBatch',args:[nativeSwapCalls(q,fee)]})}
export function validateNativeEvmSwap(q:NativeEvmSwapQuote,recovery=false,now=Date.now()){
 if(!Object.hasOwn(nativeEvmNetworks,q.network)||!q.ownerId||!q.walletId||!isAddress(q.walletAddress)||/^0x0{40}$/i.test(q.walletAddress)||q.version!==1||! /^[0-9a-f-]{36}$/i.test(q.id))fail()
 const {tokenIn,tokenOut}=nativeSwapPair(q.network,q.from,q.to),contracts=NATIVE_SWAP_CONTRACTS[q.network]
 if(!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt-q.issuedAt!==45000||!recovery&&q.expiresAt<=now)fail()
 for(const value of [q.amountUnits,q.expectedOutUnits,q.minimumOutUnits,q.feeUnits])if(typeof value!=='string'||!/^[1-9]\d{0,77}$/.test(value)||BigInt(value)>=2n**256n)fail()
 if(nativeSwapUnits(q.amount,tokenIn.decimals)!==BigInt(q.amountUnits))fail()
 const out=BigInt(q.expectedOutUnits),min=BigInt(q.minimumOutUnits)
 if(tokenOut.native&&BigInt(q.feeUnits)>=min)fail()
 if(min>out||min<out*995n/1000n||! /^-?\d+(?:\.\d+)?$/.test(q.priceImpact)||Math.abs(Number(q.priceImpact))>3)fail()
 if(!sameSwapAddress(q.tx.from,q.walletAddress)||!sameSwapAddress(q.tx.to,contracts.router)||!sameSwapAddress(q.spender,contracts.spender)||!/^\d+$/.test(q.tx.value)||BigInt(q.tx.value)!==(tokenIn.native?BigInt(q.amountUnits):0n)||!/^0x(?:[0-9a-f]{2})+$/i.test(q.tx.data)||q.tx.data.length>100000)fail()
 if(q.tx.data.slice(0,10).toLowerCase()==='0x0d5f0e3b')validateEthereumCompactSwap(q)
 else {
 const decoded=decodeFunctionData({abi:routerAbi as Abi,data:q.tx.data}),method=routerAbi.find(a=>a.name===decoded.functionName)!
 const values=Object.fromEntries(method.inputs.map((a,i)=>[a.name,decoded.args?.[i]])) as Record<string,any>,base=values.baseRequest
 if(!base)fail()
 const fromToken='0x'+(BigInt(base.fromToken)&((1n<<160n)-1n)).toString(16).padStart(40,'0')
 if(!sameSwapAddress(values.receiver||q.walletAddress,q.walletAddress)||!sameSwapAddress(fromToken,tokenIn.address)||!sameSwapAddress(base.toToken,tokenOut.address)||BigInt(base.fromTokenAmount)!==BigInt(q.amountUnits)||BigInt(base.minReturnAmount)!==min||BigInt(base.deadLine)*1000n<BigInt(q.expiresAt))fail()
 }
 const positiveSlippageFee=readStockSwapFee({tx:q.tx,expectedOut:formatUnits(out,tokenOut.decimals),decimalsOut:tokenOut.decimals},swapAbi)
 if(JSON.stringify(positiveSlippageFee)!==JSON.stringify(q.positiveSlippageFee)||q.callData!==nativeSwapBatch(q)||BigInt(q.tx.value)+BigInt(q.feeUnits)>=2n**256n)fail()
 return q
}
export async function quoteNativeEvmSwap(binding:NativeEvmSwapBinding,estimate:(data:Hex)=>Promise<string>,read:typeof okxGet=okxGet,now:()=>number=Date.now,affordable?:(quote:NativeEvmSwapQuote)=>Promise<boolean>){
 if(!Object.hasOwn(nativeEvmNetworks,binding.network)||!isAddress(binding.walletAddress))fail()
 const issuedAt=now(),{tokenIn,tokenOut}=nativeSwapPair(binding.network,binding.from,binding.to),units=nativeSwapUnits(binding.amount,tokenIn.decimals)
 const data=await read('swap',{chainIndex:String(nativeEvmNetworks[binding.network].id),fromTokenAddress:tokenIn.address,toTokenAddress:tokenOut.address,amount:String(units),userWalletAddress:binding.walletAddress,swapReceiverAddress:binding.walletAddress,swapMode:'exactIn',slippagePercent:'0.5',autoSlippage:'false',priceImpactProtectionPercent:'3'})
 const preview=await quoteNativeSwap(binding,async()=>data?.routerResult,now)
 const spender=getAddress(NATIVE_SWAP_CONTRACTS[binding.network].spender)
 if(!tokenIn.native){const approval=await read('approve-transaction',{chainIndex:String(nativeEvmNetworks[binding.network].id),tokenContractAddress:tokenIn.address,approveAmount:String(units)});if(!sameSwapAddress(approval?.dexContractAddress,spender))fail()}
 if(!data?.tx)fail()
 const q:NativeEvmSwapQuote={...binding,amount:preview.amount,outputUsdPrice:preview.outputUsdPrice,version:1,id:randomUUID(),amountUnits:String(units),expectedOutUnits:preview.expectedOutUnits,minimumOutUnits:String(data.tx.minReceiveAmount),priceImpact:preview.priceImpact,tx:{from:data.tx.from,to:data.tx.to,data:data.tx.data,value:String(data.tx.value||'0')},spender,feeUnits:'1',callData:'0x',issuedAt,expiresAt:issuedAt+45000}
 try{q.positiveSlippageFee=readStockSwapFee({tx:q.tx,expectedOut:preview.expectedOut,decimalsOut:tokenOut.decimals},swapAbi)}catch{throw Object.assign(Error('This swap route is not supported yet. Try another pair.'),{status:422})}
 q.callData=nativeSwapBatch(q);validateNativeEvmSwap(q,false,now())
 const checkBalance=async()=>{if(affordable&&!await affordable(q))throw Object.assign(Error(`Insufficient ${tokenIn.symbol} for this swap${tokenIn.native?' and network fee':''}.`),{status:409})}
 await checkBalance()
 for(let pass=0;pass<4;pass++){
  const estimateAmount=await estimate(q.callData)
  // Keep the existing buffered cap when it still covers this exact batch.
  if(nativeAmountUnits(estimateAmount)<=BigInt(q.feeUnits))return validateNativeEvmSwap(q,false,now())
  const fee=bufferedNativeFee(estimateAmount)
  if(tokenOut.native&&fee>=BigInt(q.minimumOutUnits))throw Object.assign(Error('Swap amount is too small to cover the network fee.'),{status:409})
  q.feeUnits=String(fee);q.callData=nativeSwapBatch(q)
  await checkBalance()
 }
 throw Object.assign(Error('Network fees changed. Refresh the swap estimate.'),{status:409})
}
function mac(payload:string){const secret=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(secret.length<32)throw Error('Swap signing unavailable.');return createHmac('sha256',secret).update('pocket:native-evm-swap:v1:'+payload).digest()}
export function sealNativeEvmSwap(q:NativeEvmSwapQuote){const payload=Buffer.from(JSON.stringify(q)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openNativeEvmSwap(token:string,owner:string,recovery=false,now=Date.now()){
 if(typeof token!=='string'||token.length>400000)fail();const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)fail();const actual=Buffer.from(signature,'base64url'),expected=mac(payload);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as NativeEvmSwapQuote;if(q.ownerId!==owner)fail();return validateNativeEvmSwap(q,recovery,now)
}
