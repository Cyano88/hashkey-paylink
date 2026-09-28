import {decodeFunctionData,getAddress,parseAbi,type Hex} from 'viem'
import {pocketApiUrl} from './pocketRoutes'
import {validateStockSwap,type StockSwapQuote} from './pocketXStocksSwap'
import {stockUsdc} from './pocketXStocksWallet'
import type {XPayProgressSnapshot} from './pocketXPayProgress'
export type XPayBankPayment={id:string;checkoutId:string;merchantId:string;merchantName:string;source:string;token:string;symbol:string;amount:string;amountUnits:string;fiatAmount:string;currency:string;state:string;swapHash?:string;payoutHash?:string;failureStage?:'swap'|'bridge'|'payment';error?:string;bankDelivery?:string;conversionHashes?:string[];createdAt:number;updatedAt:number;baseWallet:string;fundingUnits:string;bridgeUnits:string;expiresAt:number;quoteExpiresAt?:number;bankName?:string;bankLast4?:string;replacement?:{intentId:string;fundingUnits:string;expiresAt:number};bridge?:{state:string;burnHash?:string;mintHash?:string};progress:XPayProgressSnapshot}
export type XPayBankCall={kind:'approval'|'swap'|'burn';to:Hex;data:Hex;value:string;gas:string;gasPrice:string}
export type XPayBankPlan={source:string;destination:string;burnUnits:string;maxFeeUnits:string;minimumReceiveUnits:string;finality:number;expiresAt:number}
export type XPayBankResponse={payment:XPayBankPayment;payments?:XPayBankPayment[];transaction?:XPayBankCall;quote?:StockSwapQuote;bridgePlan?:XPayBankPlan;challengeId?:string}
export async function xpayBankRequest(getToken:()=>Promise<string|null>,body:Record<string,unknown>,approval?:{token:string;authorization:string}):Promise<XPayBankResponse>{
 const token=approval?.authorization||'Bearer '+await getToken()
 const response=await fetch(pocketApiUrl('/api/pocket/xpay/bank'),{method:'POST',headers:{'content-type':'application/json',authorization:token,...(approval?{'X-Pocket-Payment-Approval':approval.token}:{})},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)})
 const data=await response.json().catch(()=>null)
 if(!response.ok||!data?.ok)throw Object.assign(new Error(data?.error||'XPay is temporarily unavailable. Check your payment before trying again.'),{code:data?.code})
 return data
}
const messenger='0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'
const approvalAbi=parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
const burnAbi=parseAbi(['function depositForBurn(uint256 amount,uint32 destinationDomain,bytes32 mintRecipient,address burnToken,bytes32 destinationCaller,uint256 maxFee,uint32 minFinalityThreshold)'])
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
function invalid():never{throw Error('This transaction does not match your XPay payment. Check its status before continuing.')}
export function validateXPayBankCall(review:XPayBankPayment,response:XPayBankResponse){
 const {payment,transaction:tx,quote,bridgePlan:plan}=response
 if(!tx||payment.id!==review.id||payment.checkoutId!==review.checkoutId||payment.merchantId!==review.merchantId||!same(payment.source,review.source)||!same(payment.token,review.token)||payment.amountUnits!==review.amountUnits||payment.bridgeUnits!==review.bridgeUnits||BigInt(tx.value)!==0n||!/^\d+$/.test(tx.gas)||!/^\d+$/.test(tx.gasPrice)||BigInt(tx.gas)<=0n||BigInt(tx.gasPrice)<=0n)invalid()
 if(quote){
  validateStockSwap(quote,getAddress(review.source))
  if(!same(quote.tokenIn.address,review.token)||!same(quote.tokenOut.address,stockUsdc.address)||quote.amountUnits!==review.amountUnits||BigInt(quote.minimumOutUnits)<BigInt(review.bridgeUnits))invalid()
  if(tx.kind==='swap'){
   if(!same(tx.to,quote.tx.to)||!same(tx.data,quote.tx.data)||tx.value!==quote.tx.value)invalid()
   return tx
  }
  if(tx.kind!=='approval'||!same(tx.to,review.token))invalid()
  const decoded=decodeFunctionData({abi:approvalAbi,data:tx.data})
  if(!same(decoded.args[0],quote.spender)||![0n,BigInt(review.amountUnits)].includes(decoded.args[1]))invalid()
  return tx
 }
 if(!plan||!same(plan.source,review.source)||!same(plan.destination,review.baseWallet)||plan.expiresAt<=Date.now()||BigInt(plan.burnUnits)>BigInt(review.bridgeUnits)||BigInt(plan.minimumReceiveUnits)<BigInt(review.fundingUnits)||BigInt(plan.burnUnits)-BigInt(plan.maxFeeUnits)<BigInt(review.fundingUnits))invalid()
 if(tx.kind==='approval'){
  if(!same(tx.to,stockUsdc.address))invalid()
  const decoded=decodeFunctionData({abi:approvalAbi,data:tx.data})
  if(!same(decoded.args[0],messenger)||decoded.args[1]!==BigInt(plan.burnUnits))invalid()
  return tx
 }
 if(tx.kind!=='burn'||!same(tx.to,messenger))invalid()
 const a=decodeFunctionData({abi:burnAbi,data:tx.data}).args,recipient='0x'+getAddress(plan.destination).slice(2).toLowerCase().padStart(64,'0')
 if(a[0]!==BigInt(plan.burnUnits)||a[1]!==6||!same(a[2],recipient)||!same(a[3],stockUsdc.address)||!same(a[4],recipient)||a[5]!==BigInt(plan.maxFeeUnits)||a[6]!==plan.finality||![1000,2000].includes(a[6]))invalid()
 return tx
}
