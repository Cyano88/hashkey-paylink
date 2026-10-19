import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees'
import { decodeFunctionData, encodeFunctionData, getAddress, isAddress, type Abi, type Address, type Hex } from 'viem'
import routerAbi from './pocketOkxRouterAbi.json'
import { stockAssets, stockGasAsset, stockUsdc, stockUsdt, stockAmountUnits, type StockAsset } from './pocketXStocksWallet'

// Circle native USDC on X Layer. Bridged versions are deliberately distinct.
export { stockUsdc }
export const swapAssets = [stockUsdc, stockUsdt, stockGasAsset, ...stockAssets]
export const OKX_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const OKX_XLAYER_ROUTER = '0x7c5bee2a8091c3ef39072f64f18fac913060aeaf'
export const OKX_XLAYER_SPENDER = '0x8b773d83bc66be128c60e07e17c8901f7a64f000'
export type StockSwapQuote = {
  id: string; chainId: 196; owner: Address; tokenIn: StockAsset; tokenOut: StockAsset; amount: string; amountUnits: string;
  outputUsdPrice?:number; decimalsIn: number; decimalsOut: number; expectedOut: string; minimumOut: string; minimumOutUnits: string; expiresAt: number;
  serviceFee?: StockServiceFee;
  positiveSlippageFee?: { capPercent: number; recipient: Address }; gasFee: string; priceImpact: string; approvalRequired: boolean; spender: Address;
  tx: { from: Address; to: Address; data: Hex; value: string };
}
export const sameStockAddress = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
export const okxTokenAddress = (a: StockAsset) => a.address === 'native' ? OKX_NATIVE : a.address
export function validateStockSwap(quote: StockSwapQuote, owner: Address, now = Date.now()) {
  return validateSwap(quote, owner, now, swapAssets)
}
/** Keep the approved route while it is usable; refresh only when its lifetime is nearly spent. */
export async function stockExecutionQuote(review:StockSwapQuote,owner:Address,refresh:()=>Promise<StockSwapQuote>,now=Date.now()) {
  if(review.expiresAt>now+10_000){validateStockSwap(review,owner,now);return review}
  const fresh=await refresh()
  validateStockSwap(fresh,owner)
  if(JSON.stringify(fresh.serviceFee)!==JSON.stringify(review.serviceFee)||JSON.stringify(fresh.positiveSlippageFee)!==JSON.stringify(review.positiveSlippageFee)||fresh.amountUnits!==review.amountUnits||fresh.tokenIn.address!==review.tokenIn.address||fresh.tokenOut.address!==review.tokenOut.address||BigInt(fresh.minimumOutUnits)<BigInt(review.minimumOutUnits)||Number(fresh.gasFee)>Number(review.gasFee)*1.2)throw Error('Price or network fee changed. Review the updated amount.')
  return fresh
}
// A separate, fixed pair for bridge funding. This does not enable USDT trading.
export function validateXLayerBridgeSwap(quote: StockSwapQuote, owner: Address, now = Date.now()) {
  if (!sameStockAddress(quote.tokenIn.address, stockUsdt.address) || !sameStockAddress(quote.tokenOut.address, stockUsdc.address)) throw Error('Unsupported bridge conversion.')
  validateSwap(quote, owner, now, [stockUsdt, stockUsdc])
  if (BigInt(quote.minimumOutUnits)*10000n < stockAmountUnits(quote.expectedOut,6)*9976n-10000n) throw Error('Bridge conversion exceeds the slippage limit.')
}
function validateSwap(quote: StockSwapQuote, owner: Address, now: number, allowedAssets: StockAsset[]) {
  const fail = () => { throw Error('The swap details changed. Review them again.') }
  if (quote.chainId !== 196 || !sameStockAddress(quote.owner, owner) || !sameStockAddress(quote.tx.from, owner)
    || !sameStockAddress(quote.tx.to, OKX_XLAYER_ROUTER) || !sameStockAddress(quote.spender, OKX_XLAYER_SPENDER)
    || quote.expiresAt <= now || quote.expiresAt > now + 65_000
    || !allowedAssets.some(a => sameStockAddress(a.address, quote.tokenIn.address)) || !allowedAssets.some(a => sameStockAddress(a.address, quote.tokenOut.address))
    || sameStockAddress(quote.tokenIn.address, quote.tokenOut.address) || !/^\d+$/.test(quote.amountUnits) || !/^\d+$/.test(quote.minimumOutUnits)
    || !/^0x(?:[0-9a-f]{2})+$/i.test(quote.tx.data) || quote.tx.data.length > 100_000) fail()
  const input = BigInt(quote.amountUnits), minimum = BigInt(quote.minimumOutUnits)
  if (input <= 0n || minimum <= 0n || BigInt(quote.tx.value) !== (quote.tokenIn.address === 'native' ? input : 0n)) fail()
  if (stockAmountUnits(quote.amount, quote.decimalsIn) !== input || stockAmountUnits(quote.minimumOut, quote.decimalsOut) !== minimum) fail()
  const expected = stockAmountUnits(quote.expectedOut, quote.decimalsOut)
  if (minimum > expected || minimum < expected * 995n / 1000n || !Number.isFinite(Number(quote.priceImpact)) || Math.abs(Number(quote.priceImpact)) > 3 || !(Number(quote.gasFee) > 0)) fail()
  let decoded
  try { decoded = decodeFunctionData({ abi: routerAbi as Abi, data: quote.tx.data }) } catch { return fail() }
  const method = routerAbi.find(a => a.name === decoded.functionName)!
  const values = Object.fromEntries(method.inputs.map((arg, i) => [arg.name, decoded.args?.[i]])) as Record<string, any>
  const base = values.baseRequest
  if (!base) fail()
  const inputAddress = getAddress('0x' + (BigInt(base.fromToken) & ((1n << 160n) - 1n)).toString(16).padStart(40, '0'))
  const receiver = values.receiver || owner
  if (!isAddress(receiver) || !sameStockAddress(receiver, owner) || !sameStockAddress(inputAddress, okxTokenAddress(quote.tokenIn))
    || !sameStockAddress(base.toToken, okxTokenAddress(quote.tokenOut)) || BigInt(base.fromTokenAmount) !== BigInt(quote.serviceFee?.tradeUnits||quote.amountUnits)
    || BigInt(base.minReturnAmount) < minimum || BigInt(base.deadLine) <= BigInt(Math.floor(now / 1000))) fail()
  const serviceFee=readStockServiceFee(quote.tx.data)
  if(JSON.stringify(serviceFee)!==JSON.stringify(quote.serviceFee))fail()
  if(serviceFee){
    const spent=BigInt(serviceFee.spentUnits)
    if(input<spent||input-spent>2n)fail()
  }
  const fee = readStockSwapFee(quote)
  if (JSON.stringify(fee) !== JSON.stringify(quote.positiveSlippageFee)) fail()
}

// OKX v1.0.7 CommissionLib: recognize only the two-word, positive-slippage-only
// trailer, optionally followed by the exact stock input-fee trailer below.
export function readStockSwapFee(quote: Pick<StockSwapQuote, 'tx' | 'expectedOut' | 'decimalsOut'>, feeAbi: Abi = routerAbi as Abi) {
  const fail = () => { throw Error('Unsupported provider fee encoding.') }
  const decoded = decodeFunctionData({ abi: feeAbi, data: quote.tx.data })
  const canonical = encodeFunctionData({ abi: feeAbi, functionName: decoded.functionName, args: decoded.args }).toLowerCase()
  const raw = quote.tx.data.toLowerCase()
  if (!raw.startsWith(canonical)) return fail()
  let tail = raw.slice(canonical.length)
  const service=stockServiceTrailer(quote.tx.data)
  if(service)tail=tail.slice(0,-service.length)
  if (!tail) return undefined
  if (tail.length !== 128) return fail()
  const expectation = BigInt('0x' + tail.slice(0, 64)), fee = BigInt('0x' + tail.slice(64))
  const mask160 = (1n << 160n) - 1n
  if ((expectation >> 160n) !== 0x777777771111800000000000n || (fee >> 208n) !== 0x777777771111n) return fail()
  const cap = (fee >> 160n) & ((1n << 48n) - 1n)
  if (cap <= 0n || cap > 100n || (expectation & mask160) !== stockAmountUnits(quote.expectedOut, quote.decimalsOut) || (fee & mask160) === 0n) return fail()
  return { capPercent: Number(cap) / 10, recipient: getAddress('0x' + (fee & mask160).toString(16).padStart(40, '0')) }
}

export type StockServiceFee={bps:25;providerBps:0|5;amountUnits:string;tradeUnits:string;spentUnits:string;pocketUnits:string;providerUnits:string}
export const OKX_STOCK_FEE_RECIPIENT='0x7fC8Fd8bB3192E2d62A3d8D97d9A7924D4BaE58B'
/** Only the verified input-token fee to Pocket (and OKX's fixed 20% share).
 * No output fees, arbitrary recipients or variable fee rates are accepted. */
function stockServiceTrailer(data:Hex):{fee:StockServiceFee;length:number}|undefined{
 const decoded=decodeFunctionData({abi:routerAbi as Abi,data}),method=routerAbi.find(a=>a.name===decoded.functionName)!
 const canonical=encodeFunctionData({abi:routerAbi as Abi,functionName:decoded.functionName,args:decoded.args}).toLowerCase(),raw=data.toLowerCase()
 if(!raw.startsWith(canonical))throw Error('Unsupported service fee encoding.')
 const tail=raw.slice(canonical.length);if(tail.length<64)return
 const last=BigInt('0x'+tail.slice(-64)),flag=last>>208n
 if(flag!==0x22220afc2aaan&&flag!==0x3ca20afc2aaan)return
 const fail=()=>{throw Error('Stock service fee changed. Review the purchase again.')}
 const length=flag===0x22220afc2aaan?192:128;if(tail.length<length)fail()
 const args=Object.fromEntries(method.inputs.map((arg,i)=>[arg.name,decoded.args?.[i]])) as Record<string,any>,base=args.baseRequest
 const mask=(1n<<160n)-1n,input=BigInt(base.fromToken)&mask
 if(!stockAssets.some(a=>sameStockAddress(a.address,base.toToken))||![stockUsdc.address,stockUsdt.address,OKX_NATIVE].some(a=>BigInt(a)===input))fail()
 const words=tail.slice(-length).match(/.{64}/g)!.map(x=>BigInt('0x'+x))
 const token=words[length===192?1:0]
 if(token!==((1n<<255n)|input))fail()
 const pocket=words[0],provider=length===192?last:0n
 const rate=(v:bigint)=>(v>>160n)&((1n<<48n)-1n)
 const pocketWord=length===192?pocket:last
 if(pocketWord>>208n!==flag||(pocketWord&mask)!==BigInt(EVM_PLATFORM_TREASURY)||rate(pocketWord)!==(length===192?2000000n:2500000n))fail()
 if(length===192&&((provider&mask)!==BigInt(OKX_STOCK_FEE_RECIPIENT)||rate(provider)!==500000n))fail()
 const trade=BigInt(base.fromTokenAmount)
 const native=input===BigInt(OKX_NATIVE)
 const total=native?trade*rate(pocketWord)/997500000n+trade*rate(provider)/997500000n:trade*2500000n/997500000n
 const providerUnits=native?trade*rate(provider)/997500000n:total*rate(provider)/2500000n,pocketUnits=total-providerUnits
 if(trade<=0n)fail()
 return {length,fee:{bps:25,providerBps:length===192?5:0,amountUnits:String(total),tradeUnits:String(trade),spentUnits:String(trade+total),pocketUnits:String(pocketUnits),providerUnits:String(providerUnits)}}
}
export function readStockServiceFee(data:Hex){return stockServiceTrailer(data)?.fee}
