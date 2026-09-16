import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto'
import { decodeEventLog, decodeFunctionData, encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, parseUnits, type Address, type Hex } from 'viem'

export const ARC_SWAP_CHAIN_ID = 5042
export const ARC_SWAP_ROUTER = getAddress('0xA4072583658Fae592A3506A42431cb6316a8d40b')
export const ARC_USDC = getAddress('0x3600000000000000000000000000000000000000')
const API = 'https://li.quest/v1'
const APPROVE = parseAbi(['function approve(address spender,uint256 amount) returns (bool)'])
export const SWAP_BATCH_ABI = parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)'])
const SWAP_ABI = parseAbi(['function swapTokensMultipleV3ERC20ToERC20(bytes32 transactionId,string integrator,string referrer,address receiver,uint256 minAmount,(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[] swapData)', 'function swapTokensSingleV3ERC20ToERC20(bytes32 transactionId,string integrator,string referrer,address receiver,uint256 minAmount,(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit) swapData)', 'function swapTokensGeneric(bytes32 transactionId,string integrator,string referrer,address receiver,uint256 minAmount,(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[] swapData) payable'])
export type ArcSwapToken = { address: Address; symbol: string; name: string; decimals: number; chainId: 5042 }
export type ArcSwapQuote = {
  id: string; ownerId: string; walletId: string; walletAddress: Address; chainId: 5042
  tokenIn: ArcSwapToken; tokenOut: ArcSwapToken; amount: string; amountUnits: string
  expectedOut: string; minimumOut: string; minimumOutUnits: string
  expiresAt: number; callData: Hex; provider: string; gasUsdc: string
  fees: Array<{ name: string; amount: string; symbol: string; included: boolean }>
}
function fail(message: string, status = 400): never { throw Object.assign(new Error(message), { status }) }
function same(a: unknown, b: string) { return typeof a === 'string' && a.toLowerCase() === b.toLowerCase() }
export function swapToken(value: any): ArcSwapToken {
  if (!value || value.chainId !== ARC_SWAP_CHAIN_ID || !isAddress(value.address) || /^0x0{40}$/i.test(value.address)
    || !Number.isInteger(value.decimals) || value.decimals < 0 || value.decimals > 18
    || typeof value.symbol !== 'string' || !value.symbol || value.symbol.length > 40) fail('Unsupported Arc token.')
  return { address: getAddress(value.address), symbol: value.symbol, name: String(value.name || value.symbol).slice(0, 100), decimals: value.decimals, chainId: 5042 }
}
async function provider(path: string, fetcher = fetch) {
  const response = await fetcher(`${API}${path}`, { headers: process.env.LIFI_API_KEY ? { 'x-lifi-api-key': process.env.LIFI_API_KEY } : {}, signal: AbortSignal.timeout(20_000) })
  const data = await response.json() as any
  if (!response.ok) fail(response.status === 404 ? 'No swap route is available for this pair and amount.' : 'Arc swap quotes are temporarily unavailable.', 503)
  return data
}
export async function readArcSwapToken(address: string, fetcher = fetch): Promise<ArcSwapToken> {
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) fail('Enter a valid Arc token contract address.')
  const data = await provider('/token?' + new URLSearchParams({ chain: '5042', token: address }), fetcher)
  const token = swapToken(data)
  if (!same(token.address, address)) fail('Token discovery returned a different contract.', 502)
  return token
}
export async function readArcSwapTokens(fetcher = fetch): Promise<ArcSwapToken[]> {
  const data = await provider('/tokens?chains=5042', fetcher)
  if (!Array.isArray(data.tokens?.['5042'])) fail('Arc token discovery is unavailable.', 503)
  return data.tokens['5042'].flatMap((item: unknown) => { try { return [swapToken(item)] } catch { return [] } })
}
export function validateArcSwapQuote(data: any, input: { walletAddress: Address; tokenIn: ArcSwapToken; tokenOut: ArcSwapToken; amountUnits: bigint }) {
  const action = data?.action, tx = data?.transactionRequest, estimate = data?.estimate
  if (!action || !tx || !estimate || action.fromChainId !== 5042 || action.toChainId !== 5042 || tx.chainId !== 5042
    || !same(action.fromAddress, input.walletAddress) || !same(action.toAddress, input.walletAddress) || !same(tx.from, input.walletAddress)
    || !same(action.fromToken?.address, input.tokenIn.address) || !same(action.toToken?.address, input.tokenOut.address)
    || String(action.fromAmount) !== String(input.amountUnits) || !same(tx.to, ARC_SWAP_ROUTER)
    || !same(estimate.approvalAddress, ARC_SWAP_ROUTER) || BigInt(tx.value ?? '0') !== 0n
    || !/^0x(?:[0-9a-f]{2})+$/i.test(tx.data ?? '') || tx.data.length > 50_000
    || !Array.isArray(data.includedSteps) || data.includedSteps.some((step: any) => !['swap', 'protocol'].includes(step.type) || step.action?.fromChainId !== 5042 || step.action?.toChainId !== 5042)) fail('The provider returned an invalid Arc-only swap route.', 502)
  const min = BigInt(estimate.toAmountMin), out = BigInt(estimate.toAmount)
  if (min <= 0n || out < min || min * 10_000n < out * 9_950n - 10_000n) fail('The quote exceeded the 0.5% slippage limit.', 502)
  // Verify the router's encoded receiver and minimum, not just the quote metadata.
  let decoded: ReturnType<typeof decodeFunctionData<typeof SWAP_ABI>>
  try { decoded = decodeFunctionData({ abi: SWAP_ABI, data: tx.data }) } catch { fail('This Arc router operation is not supported.', 502) }
  const [, , , receiver, minimum, rawSteps] = decoded.args!
  const steps = Array.isArray(rawSteps) ? rawSteps : [rawSteps]
  if (!same(receiver, input.walletAddress) || minimum < min || !steps.length
    || !same(steps[0].sendingAssetId, input.tokenIn.address)
    || !same(steps[steps.length - 1].receivingAssetId, input.tokenOut.address)
    || steps.filter(step => decoded.functionName === 'swapTokensSingleV3ERC20ToERC20' || step.requiresDeposit).reduce((sum, step) => sum + (same(step.sendingAssetId, input.tokenIn.address) ? step.fromAmount : fail('Unexpected input asset.', 502)), 0n) !== input.amountUnits) fail('Swap calldata does not match the approved tokens and recipient.', 502)
  return { min, out, tx }
}
export async function quoteArcSwap(input: { ownerId: string; walletId: string; walletAddress: Address; tokenIn: string; tokenOut: string; amount: string }, fetcher = fetch): Promise<ArcSwapQuote> {
  const tokens = await readArcSwapTokens(fetcher)
  const [tokenIn, tokenOut] = await Promise.all([input.tokenIn, input.tokenOut].map(address =>
    tokens.find(token => same(token.address, address)) ?? readArcSwapToken(address, fetcher)))
  if (!tokenIn || !tokenOut || same(tokenIn.address, tokenOut.address)) fail('Choose two different supported Arc tokens.')
  if (!/^\d+(?:\.\d+)?$/.test(input.amount) || input.amount.length > 70 || (input.amount.split('.')[1]?.length ?? 0) > tokenIn.decimals) fail('Enter an amount within the token precision.')
  const amountUnits = parseUnits(input.amount, tokenIn.decimals)
  if (amountUnits <= 0n) fail('Enter a positive swap amount.')
  const query = new URLSearchParams({ fromChain: '5042', toChain: '5042', fromToken: tokenIn.address, toToken: tokenOut.address, fromAddress: input.walletAddress, toAddress: input.walletAddress, fromAmount: String(amountUnits), slippage: '0.005', integrator: 'hashpaylink' })
  const data = await provider(`/quote?${query}`, fetcher)
  const { min, out, tx } = validateArcSwapQuote(data, { ...input, tokenIn, tokenOut, amountUnits })
  const approve = (value: bigint) => ({ target: tokenIn.address, value: 0n, data: encodeFunctionData({ abi: APPROVE, functionName: 'approve', args: [ARC_SWAP_ROUTER, value] }) })
  const callData = encodeFunctionData({ abi: SWAP_BATCH_ABI, functionName: 'executeBatch', args: [[approve(0n), approve(amountUnits), { target: ARC_SWAP_ROUTER, value: 0n, data: tx.data }, approve(0n)]] })
  return { id: randomUUID(), ownerId: input.ownerId, walletId: input.walletId, walletAddress: input.walletAddress, chainId: 5042, tokenIn, tokenOut,
    amount: formatUnits(amountUnits, tokenIn.decimals), amountUnits: String(amountUnits), expectedOut: formatUnits(out, tokenOut.decimals), minimumOut: formatUnits(min, tokenOut.decimals), minimumOutUnits: String(min),
    expiresAt: Date.now() + 60_000, callData, provider: String(data.tool ?? 'LI.FI').slice(0, 60),
    gasUsdc: formatUnits((data.estimate.gasCosts ?? []).reduce((sum: bigint, cost: any) => sum + BigInt(cost.amount ?? 0), 0n), 18),
    fees: (data.estimate.feeCosts ?? []).map((fee: any) => ({ name: String(fee.name).slice(0, 100), amount: formatUnits(BigInt(fee.amount), Number(fee.token.decimals)), symbol: String(fee.token.symbol).slice(0, 40), included: fee.included === true })),
  }
}
function quoteSecret() {
  const secret = process.env.POCKET_SWAP_QUOTE_SECRET || process.env.PRIVY_APP_SECRET || ''
  if (secret.length < 32) fail('Arc swap quote signing is not configured.', 503)
  return secret
}
export function sealArcSwapQuote(quote: ArcSwapQuote, secret = quoteSecret()) {
  const payload = Buffer.from(JSON.stringify(quote)).toString('base64url')
  return `${payload}.${createHmac('sha256', secret).update('arc-swap-v1:' + payload).digest('base64url')}`
}
export function openArcSwapQuote(token: string, ownerId: string, allowExpired = false, secret = quoteSecret()): ArcSwapQuote {
  if (token.length > 100_000) fail('Invalid swap quote.')
  const parts = token.split('.'); if (parts.length !== 2) fail('Invalid swap quote.')
  const expected = createHmac('sha256', secret).update('arc-swap-v1:' + parts[0]).digest()
  const actual = Buffer.from(parts[1], 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail('Invalid swap quote.')
  const quote = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as ArcSwapQuote
  if (quote.ownerId !== ownerId || quote.chainId !== 5042) fail('This quote belongs to another wallet.', 403)
  if (!allowExpired && quote.expiresAt <= Date.now()) fail('Quote expired. Review a new quote before confirming.', 409)
  return quote
}

const SWAP_RECEIPT_ABI = parseAbi([
  'event LiFiGenericSwapCompleted(bytes32 indexed transactionId,string integrator,string referrer,address receiver,address fromAssetId,address toAssetId,uint256 fromAmount,uint256 toAmount)',
  'event Transfer(address indexed from,address indexed to,uint256 value)',
])
export function confirmedArcSwapAmount(quote: ArcSwapQuote, receipt: { status: string; logs: readonly { address: string; data: Hex; topics: readonly Hex[] }[] }): string | null {
  if (receipt.status !== 'success') return null
  const batch = decodeFunctionData({ abi: SWAP_BATCH_ABI, data: quote.callData })
  const routerCall = batch.args[0].find(call => same(call.target, ARC_SWAP_ROUTER))
  if (!routerCall) return null
  const id = routerCall.data.slice(10, 74).toLowerCase()
  let inputDebit = 0n, outputCredit = 0n, completed = false
  for (const log of receipt.logs) {
    try {
      const event = decodeEventLog({ abi: SWAP_RECEIPT_ABI, data: log.data, topics: log.topics as [Hex, ...Hex[]] })
      if (event.eventName === 'Transfer') {
        if (same(log.address, quote.tokenIn.address) && same(event.args.from, quote.walletAddress)) inputDebit += event.args.value
        if (same(log.address, quote.tokenOut.address) && same(event.args.to, quote.walletAddress)) outputCredit += event.args.value
        if (same(log.address, quote.tokenOut.address) && same(event.args.from, quote.walletAddress)) outputCredit -= event.args.value
      } else if (same(log.address, ARC_SWAP_ROUTER) && event.args.transactionId.slice(2).toLowerCase() === id
        && same(event.args.receiver, quote.walletAddress) && same(event.args.fromAssetId, quote.tokenIn.address)
        && same(event.args.toAssetId, quote.tokenOut.address) && event.args.fromAmount === BigInt(quote.amountUnits)
        && event.args.toAmount >= BigInt(quote.minimumOutUnits)) completed = true
    } catch { /* Only accept the expected router and token logs. */ }
  }
  return completed && inputDebit === BigInt(quote.amountUnits) && outputCredit >= BigInt(quote.minimumOutUnits)
    ? formatUnits(outputCredit, quote.tokenOut.decimals) : null
}
