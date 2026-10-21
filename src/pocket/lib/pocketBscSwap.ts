import {decodeFunctionData, encodeFunctionData, formatUnits, getAddress, isAddress, parseAbi, type Abi, type Hex} from 'viem'
import routerAbi from './pocketOkxRouterAbi.json'
import {POCKET_BSC, pocketBscAsset, type PocketBscAsset} from './pocketBsc.js'
import {bscSwapGasPolicy} from './pocketBscFunding.js'
import {readStockSwapFee} from './pocketXStocksSwap.js'
import {EVM_PLATFORM_TREASURY} from '../../lib/platformFees.js'

export type BscSwapQuote = {
  version: 1; chainId: 56; id: string; ownerId: string; walletId: string; walletAddress: Hex
  from: PocketBscAsset; to: PocketBscAsset; totalInputUnits: string; tradeInputUnits: string
  reimbursementUnits: string; nativeGasReserveUnits: string; expectedOutUnits: string; minimumOutUnits: string
  issuedAt: number; expiresAt: number; priceImpact: string
  tx: {from: Hex; to: Hex; data: Hex; value: string}
  nativeGas?: {gasLimit: string; maxFeePerGas: string; maxPriorityFeePerGas: string}
  positiveSlippageFee?: {capPercent: number; recipient: Hex}
}
const tokenAbi = parseAbi(['function approve(address,uint256) returns(bool)', 'function transfer(address,uint256) returns(bool)'])
const same = (a: unknown, b: string) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase()
const invalid = (): never => {throw Error('BSC swap details changed. Review the swap again.')}
const uint = (v: unknown): v is string => typeof v === 'string' && /^(0|[1-9]\d{0,77})$/.test(v) && BigInt(v) < 2n ** 256n

/** Independent BSC validation. Never widen X Layer's chain/address allowlist. */
export function validateBscSwap(q: BscSwapQuote, now = Date.now(), recovery = false) {
  if (!q || q.version !== 1 || q.chainId !== 56 || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(q.id)
    || typeof q.ownerId !== 'string' || !q.ownerId || q.ownerId.length > 256 || !/^[a-zA-Z0-9]{10,64}$/.test(q.walletId)
    || !isAddress(q.walletAddress) || /^0x0{40}$/i.test(q.walletAddress) || same(q.walletAddress, EVM_PLATFORM_TREASURY)) invalid()
  const policy = bscSwapGasPolicy(q.from, q.to), input = pocketBscAsset(q.from), output = pocketBscAsset(q.to)
  if (!Number.isSafeInteger(q.issuedAt) || !Number.isSafeInteger(q.expiresAt) || q.issuedAt > now + 5000
    || q.expiresAt <= q.issuedAt || q.expiresAt - q.issuedAt > 30000 || (!recovery && q.expiresAt <= now)) invalid()
  for (const n of [q.totalInputUnits, q.tradeInputUnits, q.reimbursementUnits, q.nativeGasReserveUnits, q.expectedOutUnits, q.minimumOutUnits, q.tx?.value]) if (!uint(n)) invalid()
  const total = BigInt(q.totalInputUnits), trade = BigInt(q.tradeInputUnits), fee = BigInt(q.reimbursementUnits), gas = BigInt(q.nativeGasReserveUnits)
  const expected = BigInt(q.expectedOutUnits), minimum = BigInt(q.minimumOutUnits)
  // Token amounts are integers. OKX floors the 0.5% slippage minimum; comparing
  // multiplied fractions would reject a valid route by less than one base unit.
  if (total <= 0n || trade <= 0n || expected <= 0n || minimum <= 0n || minimum > expected || minimum < expected * 995n / 1000n) invalid()
  if (policy.mode === 'native' ? fee !== 0n || gas <= 0n || total !== trade || total + gas >= 2n ** 256n : gas !== 0n || fee <= 0n || trade + fee !== total) invalid()
  if (policy.mode === 'native') {
    if (!q.nativeGas || ![q.nativeGas.gasLimit, q.nativeGas.maxFeePerGas, q.nativeGas.maxPriorityFeePerGas].every(uint)) return invalid()
    const limit = BigInt(q.nativeGas.gasLimit), max = BigInt(q.nativeGas.maxFeePerGas), priority = BigInt(q.nativeGas.maxPriorityFeePerGas)
    if (limit < 21000n || limit > 10000000n || max <= 0n || priority > max || limit * max !== gas) invalid()
  } else if (q.nativeGas !== undefined) invalid()
  if (typeof q.priceImpact !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(q.priceImpact) || Math.abs(Number(q.priceImpact)) > 3) invalid()
  if (!same(q.tx.from, q.walletAddress) || !same(q.tx.to, POCKET_BSC.router) || BigInt(q.tx.value) !== (input.native ? trade : 0n)
    || typeof q.tx.data !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(q.tx.data) || q.tx.data.length > 100000) invalid()
  const decoded = decodeFunctionData({abi: routerAbi as Abi, data: q.tx.data})
  const method = routerAbi.find(a => a.name === decoded.functionName)
  if (!method) return invalid()
  const values = Object.fromEntries(method.inputs.map((arg, i) => [arg.name, decoded.args?.[i]])) as Record<string, any>
  const base = values.baseRequest
  if (!base || !same(values.receiver || q.walletAddress, q.walletAddress)
    || (BigInt(base.fromToken) & ((1n << 160n) - 1n)) !== BigInt(input.address)
    || !same(base.toToken, output.address) || BigInt(base.fromTokenAmount) !== trade || BigInt(base.minReturnAmount) !== minimum
    || BigInt(base.deadLine) * 1000n < BigInt(q.expiresAt)) invalid()
  const feeTrailer = readStockSwapFee({tx: q.tx, expectedOut: formatUnits(expected, 18), decimalsOut: 18})
  // Postgres jsonb reorders object keys. Compare the signed fee values, not serialization order.
  const quotedFee = q.positiveSlippageFee
  if (feeTrailer ? !quotedFee || feeTrailer.capPercent !== quotedFee.capPercent || !same(quotedFee.recipient, feeTrailer.recipient)
    : quotedFee !== undefined) invalid()
  return q
}

/** Approve exact input, swap, revoke, repay: one atomic Privy batch. */
export function bscSponsoredSwapCalls(q: BscSwapQuote, now = Date.now()) {
  validateBscSwap(q, now)
  if (q.from === 'BNB') invalid()
  const token = getAddress(pocketBscAsset(q.from).address)
  const approve = (amount: bigint) => ({to: token, value: '0x0' as const, data: encodeFunctionData({abi: tokenAbi, functionName: 'approve', args: [getAddress(POCKET_BSC.spender), amount]})})
  return [approve(0n), approve(BigInt(q.tradeInputUnits)), {to: q.tx.to, data: q.tx.data, value: '0x0' as const}, approve(0n),
    {to: token, value: '0x0' as const, data: encodeFunctionData({abi: tokenAbi, functionName: 'transfer', args: [EVM_PLATFORM_TREASURY, BigInt(q.reimbursementUnits)]})}]
}

export function bscSwapRequest(q: BscSwapQuote, appId: string, now = Date.now()) {
  validateBscSwap(q, now)
  if (!/^[a-zA-Z0-9]{1,128}$/.test(appId)) invalid()
  return {
    version: 1 as const, method: 'POST' as const, url: `https://api.privy.io/v1/wallets/${q.walletId}/rpc`,
    headers: {'privy-app-id': appId, 'privy-idempotency-key': q.id, 'privy-request-expiry': String(q.expiresAt)},
    body: q.from === 'BNB'
      ? {chain_type: 'ethereum', method: 'eth_sendTransaction', caip2: 'eip155:56', sponsor: false,
          params: {transaction: {...q.tx, value: '0x' + BigInt(q.tx.value).toString(16), chain_id: '0x38', type: 2,
            gas_limit: '0x' + BigInt(q.nativeGas!.gasLimit).toString(16), max_fee_per_gas: '0x' + BigInt(q.nativeGas!.maxFeePerGas).toString(16), max_priority_fee_per_gas: '0x' + BigInt(q.nativeGas!.maxPriorityFeePerGas).toString(16)}}}
      : {chain_type: 'ethereum', method: 'wallet_sendCalls', caip2: 'eip155:56', sponsor: true, params: {calls: bscSponsoredSwapCalls(q, now)}},
  }
}
