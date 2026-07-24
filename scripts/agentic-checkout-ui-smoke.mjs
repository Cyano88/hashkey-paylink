import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentCheckoutPage.tsx', import.meta.url), 'utf8')

for (const required of [
  'usePocketIdentity',
  'usePocketX402Controller',
  'SlideAction',
  '/api/v2/checkouts/agent/pay',
  'USDC balance',
  'App Pay balance',
  'Copy deposit address',
  'Continue to {checkout.merchantName}',
  'How it works',
  'Fund App Pay',
  'Slide to pay',
  'connectionAttempts < 3',
  'Hash PayLink could not reach secure checkout',
]) {
  assert.ok(source.includes(required), `Agent checkout must retain ${required}`)
}

for (const forbidden of [
  'Copy agent payment endpoint',
  'gatewayWalletUrl',
  'pocketUrl(',
  '/home/smart-wallet',
  '/home/x402',
]) {
  assert.equal(source.includes(forbidden), false, `Agent checkout must not contain ${forbidden}`)
}

console.log('Agent checkout UI source smoke checks passed.')
