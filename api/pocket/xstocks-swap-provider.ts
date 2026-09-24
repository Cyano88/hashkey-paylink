import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { formatUnits, getAddress, parseAbi, type Address } from 'viem'
import { stockClient, stockTokenAbi, stockAmountUnits, assertStockChain } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { swapAssets, readStockSwapFee, okxTokenAddress, validateStockSwap, sameStockAddress, OKX_XLAYER_ROUTER, OKX_XLAYER_SPENDER, type StockSwapQuote } from '../../src/pocket/lib/pocketXStocksSwap.js'

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
  if (!response.ok || body.code !== '0' || !Array.isArray(body.data) || !body.data.length) fail('No executable quote is available for this pair and amount. Please try again.', 503)
  return body.data[0]
}
export async function quoteStockSwap(input: { owner: Address; tokenIn: string; tokenOut: string; amount: string }) {
  if (!okxConfigured()) fail('Stock trading is awaiting provider activation.', 503)
  const tokenIn = swapAssets.find(a => sameStockAddress(a.address, input.tokenIn))
  const tokenOut = swapAssets.find(a => sameStockAddress(a.address, input.tokenOut))
  if (!tokenIn || !tokenOut || sameStockAddress(tokenIn.address, tokenOut.address)) fail('Choose two different supported assets.')
  if (input.amount.length > 80) fail('Invalid amount.')
  await assertStockChain()
  const [decimalsIn, decimalsOut] = await Promise.all([tokenIn, tokenOut].map(a => a.address === 'native' ? Promise.resolve(18) : stockClient.readContract({ address: getAddress(a.address), abi: stockTokenAbi, functionName: 'decimals' })))
  const units = stockAmountUnits(input.amount, decimalsIn)
  const data = await okxGet('swap', { chainIndex: '196', fromTokenAddress: okxTokenAddress(tokenIn), toTokenAddress: okxTokenAddress(tokenOut), amount: String(units), userWalletAddress: input.owner, swapReceiverAddress: input.owner, slippagePercent: '0.5', swapMode: 'exactIn', autoSlippage: 'false', priceImpactProtectionPercent: '3' })
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
    approvalRequired = await stockClient.readContract({ address: getAddress(tokenIn.address), abi: allowanceAbi, functionName: 'allowance', args: [input.owner, getAddress(OKX_XLAYER_SPENDER)] }) < units
  }
  const gas = BigInt(tx.gas || tx.gasLimit || '0'), gasPrice = BigInt(tx.gasPrice || '0')
  if (gas <= 0n || gas > 30_000_000n || gasPrice <= 0n) fail('Could not estimate the network fee.', 502)
  const quote: StockSwapQuote = { id: randomUUID(), chainId: 196, owner: input.owner, tokenIn, tokenOut, amount: formatUnits(units, decimalsIn), amountUnits: String(units), decimalsIn, decimalsOut,
    expectedOut: formatUnits(out, decimalsOut), minimumOut: formatUnits(minimum, decimalsOut), minimumOutUnits: String(minimum), expiresAt: Date.now() + 45_000,
    gasFee: formatUnits((gas + (approvalRequired ? 120_000n : 0n)) * gasPrice * 120n / 100n, 18), priceImpact: String(impact), approvalRequired, spender: getAddress(OKX_XLAYER_SPENDER),
    tx: { from: input.owner, to: getAddress(tx.to), data: tx.data, value: String(tx.value || '0') } }
  const providerFee = readStockSwapFee(quote)
  if (providerFee) quote.positiveSlippageFee = providerFee
  validateStockSwap(quote, input.owner)
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
