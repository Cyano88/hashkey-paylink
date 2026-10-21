import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {encodeFunctionData, decodeFunctionData, getAddress, parseAbi} from 'viem'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
import {bscSponsoredSwapCalls, bscSwapRequest, validateBscSwap} from '../src/pocket/lib/pocketBscSwap.ts'
import {quoteBscSwap, sealBscSwap, openBscSwap} from '../api/pocket/bsc-swap-quote.ts'
import {makeSponsoredBatchRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
const abi = JSON.parse(readFileSync('src/pocket/lib/pocketOkxRouterAbi.json', 'utf8'))
const erc20 = parseAbi(['function approve(address,uint256) returns(bool)', 'function transfer(address,uint256) returns(bool)'])
const wallet = getAddress('0x' + '1'.repeat(40)), now = Date.now(), secret = 'bsc-fixture-secret-'.repeat(3)
const fee = 26736000000000000n
function fixture(stable, reverse = false) {
  const binding = {ownerId: 'fixtureOwner', walletId: 'fixturewallet1234', walletAddress: wallet, from: reverse ? 'BNB' : stable, to: reverse ? stable : 'BNB', totalInputUnits: '1000000000000000000'}
  const requests = []
  const d = {
    now: () => now, chainId: async () => 56, balance: async () => 10n ** 22n,
    estimateNative: async () => ({gasLimit: '200000', maxFeePerGas: '1000000000', maxPriorityFeePerGas: '100000000'}),
    estimateSponsored: async () => ({feeUnits: String(fee), expiresAt: now + 25000}),
    read: async (path, query) => {
      requests.push({path, query})
      if (path === 'approve-transaction') return {dexContractAddress: POCKET_BSC.spender}
      const output = 10n ** 15n, min = output * 995n / 1000n
      return {routerResult: {chainIndex: '56', fromTokenAmount: query.amount, toTokenAmount: String(output), priceImpactPercent: '0.1',
        fromToken: {tokenContractAddress: query.fromTokenAddress, decimal: '18'}, toToken: {tokenContractAddress: query.toTokenAddress, decimal: '18'}},
        tx: {from: wallet, to: getAddress(POCKET_BSC.router), value: reverse ? query.amount : '0', minReceiveAmount: String(min),
          data: encodeFunctionData({abi, functionName: 'smartSwapByOrderId', args: [1n, {fromToken: BigInt(query.fromTokenAddress), toToken: getAddress(query.toTokenAddress), fromTokenAmount: BigInt(query.amount), minReturnAmount: min, deadLine: BigInt(Math.floor(now / 1000) + 300)}, [], [], []]})}}
    },
  }
  return {binding, d, requests}
}
for (const stable of ['USDC', 'USDT']) for (const reverse of [false, true]) {
  const {binding, d, requests} = fixture(stable, reverse)
  const q = await quoteBscSwap(binding, d)
  assert.equal(q.reimbursementUnits, reverse ? '0' : String(fee))
  assert.equal(BigInt(q.tradeInputUnits) + BigInt(q.reimbursementUnits), BigInt(binding.totalInputUnits))
  const request = bscSwapRequest(q, 'fixtureApp', now)
  assert.equal(request.body.caip2, 'eip155:56'); assert.equal(request.body.sponsor, !reverse)
  if (reverse) {
    assert.equal(request.body.method, 'eth_sendTransaction')
    assert.equal(BigInt(request.body.params.transaction.gas_limit) * BigInt(request.body.params.transaction.max_fee_per_gas), BigInt(q.nativeGasReserveUnits))
    assert.throws(() => bscSponsoredSwapCalls(q, now))
    assert.equal(requests.length, 1)
  } else {
    assert.equal(request.body.method, 'wallet_sendCalls')
    const calls = request.body.params.calls
    assert.equal(calls.length, 5)
    assert.deepEqual(calls.map(c => c.value), Array(5).fill('0x0'))
    assert.equal(decodeFunctionData({abi: erc20, data: calls[0].data}).args[1], 0n)
    assert.equal(decodeFunctionData({abi: erc20, data: calls[1].data}).args[1], BigInt(q.tradeInputUnits))
    assert.equal(decodeFunctionData({abi: erc20, data: calls[3].data}).args[1], 0n)
    const payment = decodeFunctionData({abi: erc20, data: calls[4].data})
    assert.equal(payment.args[0].toLowerCase(), EVM_PLATFORM_TREASURY.toLowerCase()); assert.equal(payment.args[1], fee)
    assert.equal(calls[4].to.toLowerCase(), POCKET_BSC.assets[stable].address.toLowerCase())
    assert.equal(q.expiresAt, now + 25000)
    assert.equal(requests.filter(r => r.path === 'swap').length, 2)
  }
  const token = sealBscSwap(q, secret, now)
  assert.deepEqual(openBscSwap(token, binding, secret, now), JSON.parse(JSON.stringify(q)))
  assert.throws(() => openBscSwap(token, {...binding, ownerId: 'foreign'}, secret, now))
  assert.throws(() => openBscSwap(token, {...binding, walletId: 'foreignwallet123'}, secret, now))
  assert.throws(() => openBscSwap(token, {...binding, walletAddress: '0x' + '2'.repeat(40)}, secret, now))
  assert.throws(() => openBscSwap(token + '.extra', binding, secret, now))
  assert.throws(() => openBscSwap(token, binding, 'wrong'.repeat(10), now))
  assert.throws(() => openBscSwap(token, binding, secret, now + 31000))
  assert.ok(openBscSwap(token, binding, secret, now + 31000, true))
  for (const mutate of [x => x.chainId = 196, x => x.tx.to = wallet, x => x.tx.from = POCKET_BSC.spender, x => x.tx.value = '5', x => x.tx.data += '00', x => x.minimumOutUnits = '1', x => x.totalInputUnits = '1', x => x.from = 'ETH', x => x.reimbursementUnits = '1', x => x.nativeGasReserveUnits = '1', x => x.priceImpact = 'NaN', x => x.priceImpact = '', x => x.expiresAt += 60000]) {
    const bad = structuredClone(q); mutate(bad); assert.throws(() => validateBscSwap(bad, now))
  }
  await assert.rejects(() => quoteBscSwap(binding, {...d, chainId: async () => 196}))
  await assert.rejects(() => quoteBscSwap(binding, {...d, balance: async () => 1n}), /Insufficient/)
  if (reverse) await assert.rejects(() => quoteBscSwap(binding, {...d, balance: async () => BigInt(binding.totalInputUnits)}), /network fee/)
  else {
    await assert.rejects(() => quoteBscSwap(binding, {...d, estimateSponsored: async () => ({feeUnits: String(fee), expiresAt: now})}))
    let rising = 0n
    await assert.rejects(() => quoteBscSwap(binding, {...d, estimateSponsored: async () => ({feeUnits: String(++rising * fee), expiresAt: now + 30000})}), /Network fee changed/)
  }
  await assert.rejects(() => quoteBscSwap(binding, {...d, read: async (p, query) => {
    const r = await d.read(p, query); if (r.routerResult) r.routerResult.fromToken.decimal = '6'; return r
  }}))
}
assert.equal(makeSponsoredBatchRequest({appId: 'app', walletId: 'wallet', attemptId: 'attempt', expiresAt: now + 1000, calls: []}).body.caip2, 'eip155:196')
console.log('PASS four BSC directions; exact stable reimbursement batch; native gas caps; chain/owner/wallet/route/expiry binding; shortfalls, 18 decimals, bounded fee convergence; X Layer request unchanged. Fixtures only, no broadcast.')

for (const q of JSON.parse(readFileSync('scripts/fixtures/bsc-live-quotes.json', 'utf8'))) {
 validateBscSwap(q, q.issuedAt)
 assert.throws(() => validateBscSwap({...q, minimumOutUnits: String(BigInt(q.expectedOutUnits) * 995n / 1000n - 1n)}, q.issuedAt))
}
console.log('PASS captured real OKX BSC routes in all four directions; integer slippage flooring with no extra tolerance')
