import {EVM_PLATFORM_TREASURY} from '../../src/lib/platformFees.js'
import {readStockServiceFee} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {swapTokenUsdPrice} from '../../src/pocket/lib/pocketSwapUsd.js'
import {xLayer} from 'viem/chains'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { createPublicClient, http, formatUnits, getAddress, parseAbi, type Address } from 'viem'
import { stockClient, stockTokenAbi, stockAmountUnits, assertStockChain, stockUsdc, stockUsdt, stockAssets } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { swapAssets, readStockSwapFee, okxTokenAddress, validateStockSwap, sameStockAddress, OKX_XLAYER_ROUTER, OKX_XLAYER_SPENDER, type StockSwapQuote } from '../../src/pocket/lib/pocketXStocksSwap.js'
import {validateXLayerBridgeSwap} from '../../src/pocket/lib/pocketXStocksSwap.js'

const allowanceAbi = parseAbi(['function allowance(address,address) view returns(uint256)'])
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }) }
export function okxCredentials() {
  const dedicated = ['OKX_DEX_API_KEY', 'OKX_DEX_SECRET_KEY', 'OKX_DEX_PASSPHRASE'].some(k => !!process.env[k])
  return dedicated ? { key: process.env.OKX_DEX_API_KEY, secret: process.env.OKX_DEX_SECRET_KEY, passphrase: process.env.OKX_DEX_PASSPHRASE } : { key: process.env.OKX_API_KEY, secret: process.env.OKX_SECRET_KEY, passphrase: process.env.OKX_PASSPHRASE }
}
export const okxConfigured = () => { const c = okxCredentials(); return !!(c.key && c.secret && c.passphrase) }
export async function okxGet(path: string, query: Record<string, string>, fetcher = fetch) {
  if (!okxConfigured()) fail('Stock trading is awaiting provider activation.', 503)
  const credentials = okxCredentials()
  const requestPath = '/api/v6/dex/aggregator/' + path + '?' + new URLSearchParams(query)
  const timestamp = new Date().toISOString()
  const signature = createHmac('sha256', credentials.secret!).update(timestamp + 'GET' + requestPath).digest('base64')
  const response = await fetcher('https://web3.okx.com' + requestPath, { headers: {
    'OK-ACCESS-KEY': credentials.key!, 'OK-ACCESS-SIGN': signature,
    'OK-ACCESS-PASSPHRASE': credentials.passphrase!, 'OK-ACCESS-TIMESTAMP': timestamp,
  }, signal: AbortSignal.timeout(20_000), redirect: 'error' })
  const body = await response.json() as any
  if (!response.ok || body?.code !== '0') fail('No executable quote is available for this pair and amount. Please try again.', 503)
  // Solana's instruction endpoint returns a single object, unlike quote/swap.
  // This only normalizes the transport; execution must still validate every instruction.
  if (path === 'swap-instruction' && query.chainIndex === '501') {
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data) || !Object.keys(body.data).length) fail('Swap instructions are unavailable. Please try again.', 503)
    return body.data
  }
  if (!Array.isArray(body.data) || !body.data.length) fail('No executable quote is available for this pair and amount. Please try again.', 503)
  return body.data[0]
}
export async function quoteStockSwap(input: { owner: Address; tokenIn: string; tokenOut: string; amount: string }) {
  return quoteSwap(input, false)
}
export async function quoteXLayerBridgeSwap(input: {owner: Address; amount: string}) {
  return quoteSwap({...input,tokenIn:stockUsdt.address,tokenOut:stockUsdc.address}, true)
}
async function quoteSwap(input: {owner: Address; tokenIn: string; tokenOut: string; amount: string}, bridge: boolean) {
  if (!okxConfigured()) fail('Stock trading is awaiting provider activation.', 503)
  const assets = bridge ? [stockUsdt, stockUsdc] : swapAssets
  const tokenIn = assets.find(a => sameStockAddress(a.address, input.tokenIn))
  const tokenOut = assets.find(a => sameStockAddress(a.address, input.tokenOut))
  if (!tokenIn || !tokenOut || sameStockAddress(tokenIn.address, tokenOut.address)) fail('Choose two different supported assets.')
  if(!bridge&&[tokenIn,tokenOut].some(a=>a.symbol==='USDT')&&![tokenIn,tokenOut].some(a=>a.address==='native')&&!(tokenIn.symbol==='USDT'&&stockAssets.some(a=>sameStockAddress(a.address,tokenOut.address))))fail('Choose a supported stock or OKB for this swap.')
  if (input.amount.length > 80) fail('Invalid amount.')
  const client = bridge ? createPublicClient({chain:xLayer,transport:http(process.env.PRIVATE_RPC_URL_XLAYER,{timeout:15000,retryCount:0})}) : stockClient
  if(bridge){if(!process.env.PRIVATE_RPC_URL_XLAYER||await client.getChainId()!==196)fail('X Layer connection could not be verified.',503)}
  else await assertStockChain()
  const [decimalsIn, decimalsOut] = await Promise.all([tokenIn, tokenOut].map(a => a.address === 'native' ? Promise.resolve(18) : client.readContract({ address: getAddress(a.address), abi: stockTokenAbi, functionName: 'decimals' })))
  const units = stockAmountUnits(input.amount, decimalsIn)
  const serviceFeeEnabled=!bridge&&stockAssets.some(a=>sameStockAddress(a.address,tokenOut.address))&&[stockUsdc.address,stockUsdt.address,'native'].some(a=>sameStockAddress(a,tokenIn.address))
  const data = await okxGet('swap', {...(serviceFeeEnabled?{feePercent:'0.25',fromTokenReferrerWalletAddress:EVM_PLATFORM_TREASURY}:{}), chainIndex: '196', fromTokenAddress: okxTokenAddress(tokenIn), toTokenAddress: okxTokenAddress(tokenOut), amount: String(units), userWalletAddress: input.owner, swapReceiverAddress: input.owner, slippagePercent: bridge ? '0.24' : '0.5', swapMode: 'exactIn', autoSlippage: 'false', priceImpactProtectionPercent: '3' })
  const route = data.routerResult, tx = data.tx
  if (!route || !tx || String(route.chainIndex) !== '196' || String(route.fromTokenAmount) !== String(units)
    || !sameStockAddress(route.fromToken?.tokenContractAddress, okxTokenAddress(tokenIn)) || !sameStockAddress(route.toToken?.tokenContractAddress, okxTokenAddress(tokenOut))
    || !sameStockAddress(tx.from, input.owner) || !sameStockAddress(tx.to, OKX_XLAYER_ROUTER)) fail('The provider returned an unsupported route.', 502)
  const out = BigInt(route.toTokenAmount), minimum = BigInt(tx.minReceiveAmount)
  if (out <= 0n || minimum <= 0n || minimum > out || minimum < out * 995n / 1000n) fail('This quote exceeds the slippage limit.', 502)
  const rawImpact = route.priceImpactPercent ?? route.priceImpactPercentage
  const impact = rawImpact === null || rawImpact === undefined || String(rawImpact).trim() === '' ? NaN : Number(rawImpact)
  if (!Number.isFinite(impact) || Math.abs(impact) > 3) fail('Price impact is unavailable or exceeds 3%.', 502)
  let approvalRequired = false
  if (tokenIn.address !== 'native') {
    const approval = await okxGet('approve-transaction', { chainIndex: '196', tokenContractAddress: tokenIn.address, approveAmount: String(units) })
    if (!sameStockAddress(approval.dexContractAddress, OKX_XLAYER_SPENDER)) fail('The approval contract needs verification.', 502)
    approvalRequired = await client.readContract({ address: getAddress(tokenIn.address), abi: allowanceAbi, functionName: 'allowance', args: [input.owner, getAddress(OKX_XLAYER_SPENDER)] }) < units
  }
  const gas = BigInt(tx.gas || tx.gasLimit || '0'), gasPrice = BigInt(tx.gasPrice || '0')
  if (gas <= 0n || gas > 30_000_000n || gasPrice <= 0n) fail('Could not estimate the network fee.', 502)
  const quote: StockSwapQuote = { id: randomUUID(), chainId: 196, owner: input.owner, tokenIn, tokenOut, amount: formatUnits(units, decimalsIn), amountUnits: String(units), decimalsIn, decimalsOut,
    outputUsdPrice:swapTokenUsdPrice(route.toToken?.tokenUnitPrice), expectedOut: formatUnits(out, decimalsOut), minimumOut: formatUnits(minimum, decimalsOut), minimumOutUnits: String(minimum), expiresAt: Date.now() + 45_000,
    gasFee: formatUnits((gas + (approvalRequired ? 120_000n : 0n)) * gasPrice * 120n / 100n, 18), priceImpact: String(impact), approvalRequired, spender: getAddress(OKX_XLAYER_SPENDER),
    tx: { from: input.owner, to: getAddress(tx.to), data: tx.data, value: String(tx.value || '0') } }
  const serviceFee=readStockServiceFee(quote.tx.data)
  if(serviceFeeEnabled&&!serviceFee||!serviceFeeEnabled&&serviceFee)fail('Stock service fee could not be verified.',502)
  if(serviceFee)quote.serviceFee=serviceFee
  const providerFee = readStockSwapFee(quote)
  if (providerFee) quote.positiveSlippageFee = providerFee
  if(bridge)validateXLayerBridgeSwap(quote,input.owner)
  else validateStockSwap(quote, input.owner)
  return quote
}
function secret() {
  const value = process.env.POCKET_SWAP_QUOTE_SECRET || ''
  if (value.length < 32) fail('Quote verification is not configured.', 503)
  return value
}
export function sealStockQuote(quote: StockSwapQuote, userId: string, key = secret()) {
  const payload = Buffer.from(JSON.stringify({ quote, userId })).toString('base64url')
  return payload + '.' + createHmac('sha256', key).update('pocket-xstocks-v1:' + payload).digest('base64url')
}
export function openStockQuote(token: string, userId: string, key = secret()) {
  if (token.length > 200_000) fail('Invalid quote.')
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) fail('Invalid quote.')
  const expected = createHmac('sha256', key).update('pocket-xstocks-v1:' + payload).digest()
  const actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('Invalid quote.')
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { quote: StockSwapQuote; userId: string }
  if (data.userId !== userId) fail('This quote belongs to another account.', 403)
  validateStockSwap(data.quote, data.quote.owner)
  return data.quote
}
