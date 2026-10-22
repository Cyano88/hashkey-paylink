import {createHmac, randomUUID, timingSafeEqual} from 'node:crypto'
import {formatUnits, type Hex} from 'viem'
import {POCKET_BSC, pocketBscAsset, type PocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import {bscSwapGasPolicy} from '../../src/pocket/lib/pocketBscFunding.js'
import {bscSponsoredSwapCalls, validateBscSwap, type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'
import {readStockSwapFee} from '../../src/pocket/lib/pocketXStocksSwap.js'
import {normalizeBscProviderCall} from './bsc-provider-call.js'

export type BscSwapBinding = {ownerId: string; walletId: string; walletAddress: Hex; from: PocketBscAsset; to: PocketBscAsset; totalInputUnits: string}
type Dependencies = {
  chainId(): Promise<number>
  read(path: string, query: Record<string, string>): Promise<any>
  // All-in cost in the INPUT stablecoin's 18-decimal units, including Privy
  // charges and reimbursement call. Adapter must verify BSC-specific pricing.
  estimateSponsored(q: BscSwapQuote, calls: ReturnType<typeof bscSponsoredSwapCalls>): Promise<{feeUnits: string; expiresAt: number}>
  estimateNative(q: BscSwapQuote): Promise<NonNullable<BscSwapQuote['nativeGas']>>
  balance(asset: PocketBscAsset, wallet: Hex): Promise<bigint>
  now?(): number
}
const fail = (): never => {throw Error('BSC swap is temporarily unavailable.')}
const integer = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d{0,77})$/.test(v) && BigInt(v) < 2n ** 256n

/** Internal quote builder only. No public route or production estimator yet. */
export async function quoteBscSwap(binding: BscSwapBinding, d: Dependencies): Promise<BscSwapQuote> {
  const now = d.now || Date.now, issuedAt = now(), policy = bscSwapGasPolicy(binding.from, binding.to)
  if (!integer(binding.totalInputUnits) || BigInt(binding.totalInputUnits) <= 0n || await d.chainId() !== 56) fail()
  const total = BigInt(binding.totalInputUnits), input = pocketBscAsset(binding.from), output = pocketBscAsset(binding.to)
  if (await d.balance(binding.from, binding.walletAddress) < total) throw Error(`Insufficient ${binding.from}.`)
  const id = randomUUID()
  let fee = policy.mode === 'native' ? 0n : 1n
  for (let pass = 0; pass < 4; pass++) {
    if (fee >= total) throw Error('The amount is too small to cover the network fee.')
    const trade = total - fee
    const data = await d.read('swap', {chainIndex: '56', amount: String(trade), fromTokenAddress: input.address, toTokenAddress: output.address,
      userWalletAddress: binding.walletAddress, swapReceiverAddress: binding.walletAddress, swapMode: 'exactIn', slippagePercent: '0.5', autoSlippage: 'false', priceImpactProtectionPercent: '3'})
    const route = data?.routerResult
    if (!route || String(route.chainIndex) !== '56' || route.fromTokenAmount !== String(trade)
      || route.fromToken?.tokenContractAddress?.toLowerCase() !== input.address.toLowerCase() || route.toToken?.tokenContractAddress?.toLowerCase() !== output.address.toLowerCase()
      || Number(route.fromToken?.decimal) !== 18 || Number(route.toToken?.decimal) !== 18 || !integer(route.toTokenAmount)) fail()
    const q: BscSwapQuote = normalizeBscProviderCall({...binding, version: 1, chainId: 56, id, tradeInputUnits: String(trade), reimbursementUnits: String(fee),
      nativeGasReserveUnits: policy.mode === 'native' ? '21000' : '0',
      ...(policy.mode === 'native' ? {nativeGas: {gasLimit: '21000', maxFeePerGas: '1', maxPriorityFeePerGas: '0'}} : {}),
      expectedOutUnits: route.toTokenAmount, minimumOutUnits: data.tx?.minReceiveAmount, priceImpact: String(route.priceImpactPercent),
      issuedAt, expiresAt: issuedAt + 30000, tx: {from: data.tx?.from, to: data.tx?.to, data: data.tx?.data, value: String(data.tx?.value ?? '0')}})
    q.positiveSlippageFee = readStockSwapFee({tx: q.tx, expectedOut: formatUnits(BigInt(q.expectedOutUnits), 18), decimalsOut: 18})
    validateBscSwap(q, now())
    if (policy.mode === 'native') {
      q.nativeGas = await d.estimateNative(q)
      if (!q.nativeGas || ![q.nativeGas.gasLimit, q.nativeGas.maxFeePerGas, q.nativeGas.maxPriorityFeePerGas].every(integer)) fail()
      q.nativeGasReserveUnits = String(BigInt(q.nativeGas.gasLimit) * BigInt(q.nativeGas.maxFeePerGas))
      validateBscSwap(q, now())
      if (await d.balance('BNB', binding.walletAddress) < total + BigInt(q.nativeGasReserveUnits)) throw Error('Insufficient BNB for the swap and network fee.')
      return q
    }
    const approval = await d.read('approve-transaction', {chainIndex: '56', tokenContractAddress: input.address, approveAmount: String(trade)})
    if (approval?.dexContractAddress?.toLowerCase() !== POCKET_BSC.spender.toLowerCase()) fail()
    const estimate = await d.estimateSponsored(q, bscSponsoredSwapCalls(q, now()))
    if (!integer(estimate.feeUnits) || BigInt(estimate.feeUnits) <= 0n || !Number.isSafeInteger(estimate.expiresAt) || estimate.expiresAt <= now()) fail()
    q.expiresAt = Math.min(q.expiresAt, estimate.expiresAt)
    if (BigInt(estimate.feeUnits) <= fee) {
      if (await d.balance(binding.from, binding.walletAddress) < total) throw Error(`Insufficient ${binding.from}.`)
      return validateBscSwap(q, now())
    }
    fee = BigInt(estimate.feeUnits)
  }
  throw Error('Network fee changed. Review the swap again.')
}

function mac(payload: string, secret: string) {
  if (typeof secret !== 'string' || secret.length < 32) fail()
  return createHmac('sha256', secret).update('pocket:bsc:privy-swap:v1:' + payload).digest()
}
export function sealBscSwap(q: BscSwapQuote, secret: string, now = Date.now()) {
  validateBscSwap(q, now)
  const payload = Buffer.from(JSON.stringify(q)).toString('base64url')
  return payload + '.' + mac(payload, secret).toString('base64url')
}
export function openBscSwap(token: string, binding: Pick<BscSwapBinding, 'ownerId' | 'walletId' | 'walletAddress'>, secret: string, now = Date.now(), recovery = false) {
  if (typeof token !== 'string' || token.length > 200000) fail()
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) fail()
  const expected = mac(payload, secret), actual = Buffer.from(signature, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) fail()
  const q = JSON.parse(Buffer.from(payload, 'base64url').toString()) as BscSwapQuote
  if (q.ownerId !== binding.ownerId || q.walletId !== binding.walletId || q.walletAddress.toLowerCase() !== binding.walletAddress.toLowerCase()) fail()
  return validateBscSwap(q, now, recovery)
}
