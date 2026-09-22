import { decodeFunctionData, encodeFunctionData, getAddress, isAddress, type Abi, type Address, type Hex } from 'viem'
import routerAbi from './pocketOkxRouterAbi.json'
import { stockAssets, stockGasAsset, stockUsdc, stockAmountUnits, type StockAsset } from './pocketXStocksWallet'

// Circle native USDC on X Layer. Bridged versions are deliberately distinct.
export { stockUsdc }
export const swapAssets = [stockUsdc, stockGasAsset, ...stockAssets]
export const OKX_NATIVE = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
export const OKX_XLAYER_ROUTER = '0x7c5bee2a8091c3ef39072f64f18fac913060aeaf'
export const OKX_XLAYER_SPENDER = '0x8b773d83bc66be128c60e07e17c8901f7a64f000'
export type StockSwapQuote = {
  id: string; chainId: 196; owner: Address; tokenIn: StockAsset; tokenOut: StockAsset; amount: string; amountUnits: string;
  decimalsIn: number; decimalsOut: number; expectedOut: string; minimumOut: string; minimumOutUnits: string; expiresAt: number;
  gasFee: string; priceImpact: string; approvalRequired: boolean; spender: Address;
  tx: { from: Address; to: Address; data: Hex; value: string };
}
export const sameStockAddress = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
export const okxTokenAddress = (a: StockAsset) => a.address === 'native' ? OKX_NATIVE : a.address
export function validateStockSwap(quote: StockSwapQuote, owner: Address, now = Date.now()) {
  const fail = () => { throw Error('The swap route does not match your review. Request a new quote.') }
  if (quote.chainId !== 196 || !sameStockAddress(quote.owner, owner) || !sameStockAddress(quote.tx.from, owner)
    || !sameStockAddress(quote.tx.to, OKX_XLAYER_ROUTER) || !sameStockAddress(quote.spender, OKX_XLAYER_SPENDER)
    || quote.expiresAt <= now || quote.expiresAt > now + 65_000
    || !swapAssets.some(a => sameStockAddress(a.address, quote.tokenIn.address)) || !swapAssets.some(a => sameStockAddress(a.address, quote.tokenOut.address))
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
    || !sameStockAddress(base.toToken, okxTokenAddress(quote.tokenOut)) || BigInt(base.fromTokenAmount) !== input
    || BigInt(base.minReturnAmount) < minimum || BigInt(base.deadLine) <= BigInt(Math.floor(now / 1000))) fail()
  // Unknown appended commissions or arbitrary call trailers are not signed.
  const canonical = encodeFunctionData({ abi: routerAbi as Abi, functionName: decoded.functionName, args: decoded.args })
  if (canonical.toLowerCase() !== quote.tx.data.toLowerCase()) fail()
}
