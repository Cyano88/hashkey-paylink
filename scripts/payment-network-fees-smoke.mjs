import assert from 'node:assert/strict'
import { readEthUsdcRate, readNativeUsdcRate, nativeFeeToUsdcUnits } from '../api/payment-network-fees.ts'
const now = 2_000_000_000_000
const price = (timestamp, eth = 3000, usdc = 1) => async () => Response.json({ ethereum: { usd: eth, last_updated_at: timestamp }, 'usd-coin': { usd: usdc, last_updated_at: timestamp } })
await assert.rejects(readEthUsdcRate(price(now / 1000 - 181), () => now), /not fresh/)
await assert.rejects(readEthUsdcRate(price(now / 1000 + 31), () => now), /not fresh/)
await assert.rejects(readEthUsdcRate(price(now / 1000, 0), () => now), /not fresh/)
await assert.rejects(readEthUsdcRate(async () => new Response('', { status: 429 }), () => now), /unavailable/)
let calls = 0
const fetcher = async () => { calls++; return price(now / 1000)() }
assert.equal(await readEthUsdcRate(fetcher, () => now), 300000000000n)
assert.equal(await readEthUsdcRate(fetcher, () => now + 1000), 300000000000n)
assert.equal(calls, 1)
const edgeNow = now + 60_000
await readEthUsdcRate(price((edgeNow - 179_000) / 1000), () => edgeNow)
await assert.rejects(readEthUsdcRate(price((edgeNow - 179_000) / 1000), () => edgeNow + 2000), /not fresh/)
assert.throws(() => nativeFeeToUsdcUnits('0', 100000000n))
assert.throws(() => nativeFeeToUsdcUnits('-0.01', 100000000n))
assert.equal(nativeFeeToUsdcUnits('0.000000000000000001', 100000000n), 1n)
console.log('PASS: stale, future, zero and unavailable prices rejected; fresh prices cached; recovery rounds to USDC base units.')

const pol = async url => { assert.match(String(url), /polygon-ecosystem-token/); return Response.json({'polygon-ecosystem-token': {usd:0.5,last_updated_at:now/1000}, 'usd-coin': {usd:1,last_updated_at:now/1000}}) }
assert.equal(await readNativeUsdcRate('polygon', pol, () => now), 50000000n)
assert.equal(nativeFeeToUsdcUnits('1', 50000000n), 500000n)
console.log('PASS: POL conversion is separate from ETH pricing and cache.')
