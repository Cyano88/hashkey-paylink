import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {decodeFunctionData,encodeFunctionData,formatUnits,getAddress,isAddress,parseAbi,type Abi,type Hex} from 'viem'
import routerAbi from '../../src/pocket/lib/pocketOkxRouterAbi.json' with {type:'json'}
import {readStockSwapFee} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {BASE_STABLECOINS} from '../../src/lib/baseStablecoins.js'
import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {nativeFeeToUsdcUnits} from '../payment-network-fees.js'
import {nativeSwapUnits} from './native-swap-quote.js'
import {NATIVE_SWAP_CONTRACTS} from './native-evm-swap-quote.js'
import {okxGet} from './xstocks-swap-provider.js'
import {cashFundingReference} from '../../src/pocket/lib/pocketCashFundingReference.js'

export const CASH_CONVERSION_ACTION='wallet.cash-conversion'
export const CASH_CONVERSION_PREFIX='pocket:cash-conversion:'
export const CASH_BATCH_ABI=parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const tokenAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)','function transfer(address recipient,uint256 amount) returns(bool)'])
export type CashConversionBinding={fundingBridge?:string;ownerId:string;walletId:string;walletAddress:Hex;network:'base';from:'USDT';to:'USDC';amount:string}
export type CashConversionQuote=CashConversionBinding&{positiveSlippageFee?:{capPercent:number;recipient:Hex};version:1;id:string;amountUnits:string;expectedOutUnits:string;minimumOutUnits:string;feeUnits:string;tx:{from:Hex;to:Hex;data:Hex;value:string};callData:Hex;issuedAt:number;expiresAt:number;priceImpact:string}
export const sameCashAddress=(a:unknown,b:string)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase()
const fail=():never=>{throw Object.assign(Error('Cash conversion details changed. Review the amount again.'),{status:409})}
function binding(b:CashConversionBinding){
 if(b.fundingBridge!==undefined&&!cashFundingReference(b.fundingBridge))fail()
 if(b.network!=='base'||b.from!=='USDT'||b.to!=='USDC'||!b.ownerId||!b.walletId||!isAddress(b.walletAddress)||/^0x0{40}$/i.test(b.walletAddress)||sameCashAddress(b.walletAddress,EVM_PLATFORM_TREASURY))fail()
 return nativeSwapUnits(b.amount,6)
}
export function cashConversionCalls(q:CashConversionQuote){
 const approve=(amount:bigint)=>({target:getAddress(BASE_STABLECOINS.USDT.address),value:0n,data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[getAddress(NATIVE_SWAP_CONTRACTS.base.spender),amount]})})
 return [approve(0n),approve(BigInt(q.amountUnits)),{target:q.tx.to,value:0n,data:q.tx.data},approve(0n),{target:getAddress(BASE_STABLECOINS.USDC.address),value:0n,data:encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[EVM_PLATFORM_TREASURY,BigInt(q.feeUnits)]})}]
}
export function cashConversionBatch(q:CashConversionQuote){return encodeFunctionData({abi:CASH_BATCH_ABI,functionName:'executeBatch',args:[cashConversionCalls(q)]})}
export function validateCashConversion(q:CashConversionQuote,recovery=false,now=Date.now()){
 const input=binding(q)
 if(q.version!==1||! /^[0-9a-f-]{36}$/i.test(q.id)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.issuedAt>now+5000||q.expiresAt-q.issuedAt!==45000||!recovery&&q.expiresAt<=now)fail()
 for(const value of [q.amountUnits,q.expectedOutUnits,q.minimumOutUnits,q.feeUnits])if(typeof value!=='string'||!/^[1-9]\d{0,77}$/.test(value)||BigInt(value)>=2n**256n)fail()
 const out=BigInt(q.expectedOutUnits),min=BigInt(q.minimumOutUnits)
 if(input!==BigInt(q.amountUnits)||min>out||min<out*995n/1000n||BigInt(q.feeUnits)>=min||! /^-?\d+(?:\.\d+)?$/.test(q.priceImpact)||Math.abs(Number(q.priceImpact))>3)fail()
 if(!sameCashAddress(q.tx.from,q.walletAddress)||!sameCashAddress(q.tx.to,NATIVE_SWAP_CONTRACTS.base.router)||q.tx.value!=='0'||!/^0x(?:[0-9a-f]{2})+$/i.test(q.tx.data)||q.tx.data.length>100000)fail()
 const decoded=decodeFunctionData({abi:routerAbi as Abi,data:q.tx.data})
 // Only the same bounded, positive-slippage-only encoding used by native swaps.
 // Stock input fees and every other trailer remain excluded from Cash.
 if(JSON.stringify(cashProviderFee(q.tx,q.expectedOutUnits))!==JSON.stringify(q.positiveSlippageFee))fail()
 const method=routerAbi.find(a=>a.name===decoded.functionName)!
 const values=Object.fromEntries(method.inputs.map((arg,i)=>[arg.name,decoded.args?.[i]])) as Record<string,any>,base=values.baseRequest
 if(!base)fail()
 const from='0x'+(BigInt(base.fromToken)&((1n<<160n)-1n)).toString(16).padStart(40,'0')
 if(!sameCashAddress(values.receiver||q.walletAddress,q.walletAddress)||!sameCashAddress(from,BASE_STABLECOINS.USDT.address)||!sameCashAddress(base.toToken,BASE_STABLECOINS.USDC.address)||BigInt(base.fromTokenAmount)!==input||BigInt(base.minReturnAmount)!==min||BigInt(base.deadLine)*1000n<BigInt(q.expiresAt)||q.callData!==cashConversionBatch(q))fail()
 return q
}
function cashProviderFee(tx:CashConversionQuote['tx'],expectedOutUnits:string){
 const decoded=decodeFunctionData({abi:routerAbi as Abi,data:tx.data})
 const canonical=encodeFunctionData({abi:routerAbi as Abi,functionName:decoded.functionName,args:decoded.args}).toLowerCase(),raw=tx.data.toLowerCase()
 if(!raw.startsWith(canonical)||![0,128].includes(raw.length-canonical.length))fail()
 return readStockSwapFee({tx,expectedOut:formatUnits(BigInt(expectedOutUnits),6),decimalsOut:6},routerAbi as Abi)
}
export async function quoteCashConversion(b:CashConversionBinding,estimate:(data:Hex)=>Promise<string>,rateScaled8:bigint,read:typeof okxGet=okxGet,now:()=>number=Date.now){
 const units=binding(b),issuedAt=now()
 const data=await read('swap',{chainIndex:'8453',fromTokenAddress:BASE_STABLECOINS.USDT.address,toTokenAddress:BASE_STABLECOINS.USDC.address,amount:String(units),userWalletAddress:b.walletAddress,swapReceiverAddress:b.walletAddress,swapMode:'exactIn',slippagePercent:'0.5',autoSlippage:'false',priceImpactProtectionPercent:'3'})
 const route=data?.routerResult
 if(!route||String(route.chainIndex)!=='8453'||String(route.fromTokenAmount)!==String(units)||route.swapMode&&route.swapMode!=='exactIn')fail()
 for(const [actual,expected] of [[route.fromToken,BASE_STABLECOINS.USDT],[route.toToken,BASE_STABLECOINS.USDC]])if(!actual||!sameCashAddress(actual.tokenContractAddress,expected.address)||String(actual.decimal)!=='6'||actual.isHoneyPot===true||actual.taxRate==null||!/^0(?:\.0+)?$/.test(String(actual.taxRate)))fail()
 const approval=await read('approve-transaction',{chainIndex:'8453',tokenContractAddress:BASE_STABLECOINS.USDT.address,approveAmount:String(units)})
 if(!sameCashAddress(approval?.dexContractAddress,NATIVE_SWAP_CONTRACTS.base.spender)||!data?.tx)fail()
 const q:CashConversionQuote={...b,amount:formatUnits(units,6),version:1,id:randomUUID(),amountUnits:String(units),expectedOutUnits:String(route.toTokenAmount),minimumOutUnits:String(data.tx.minReceiveAmount),feeUnits:'1',priceImpact:route.priceImpactPercent,tx:{from:data.tx.from,to:data.tx.to,data:data.tx.data,value:String(data.tx.value??'0')},callData:'0x',issuedAt,expiresAt:issuedAt+45000}
 const providerFee=cashProviderFee(q.tx,q.expectedOutUnits);if(providerFee)q.positiveSlippageFee=providerFee
 for(let pass=0;pass<4;pass++){
  q.callData=cashConversionBatch(q);validateCashConversion(q,false,now())
  const fee=nativeFeeToUsdcUnits(await estimate(q.callData),rateScaled8)
  if(fee<=BigInt(q.feeUnits))return validateCashConversion(q,false,now())
  if(fee>=BigInt(q.minimumOutUnits))throw Object.assign(Error('This amount is too small to cover the network fee.'),{status:409})
  q.feeUnits=String(fee)
 }
 throw Object.assign(Error('Network fees changed. Review the updated amount.'),{status:409})
}
function mac(payload:string){const key=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(key.length<32)throw Error('Cash conversion signing unavailable.');return createHmac('sha256',key).update('pocket:cash-conversion:v1:'+payload).digest()}
export function sealCashConversion(q:CashConversionQuote){const payload=Buffer.from(JSON.stringify(q)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openCashConversion(token:string,owner:string,recovery=false,now=Date.now()){
 if(typeof token!=='string'||token.length>400000)fail()
 const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)fail()
 const actual=Buffer.from(signature,'base64url'),expected=mac(payload)
 if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as CashConversionQuote
 if(q.ownerId!==owner)fail()
 return validateCashConversion(q,recovery,now)
}
