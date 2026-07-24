import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentCheckoutPage.tsx', import.meta.url), 'utf8')
const controllerSource = readFileSync(new URL('../src/pocket/controllers/usePocketX402Controller.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/Layout.tsx', import.meta.url), 'utf8')

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
  'footer={<CheckoutHowItWorks />}',
  "Circle's minimum App Pay transfer is 0.5 USDC.",
  "x402.walletStep === 'done'",
  'src="/pocket-circle.png"',
]) {
  assert.ok(source.includes(required), `Agent checkout must retain ${required}`)
}

for (const forbidden of [
  'Copy agent payment endpoint',
  'gatewayWalletUrl',
  'pocketUrl(',
  '/home/smart-wallet',
  '/home/x402',
  'One checkout · one approval',
  'This checkout needs ${checkout.amount} USDC in App Pay',
  '<Wallet className=',
  'min-h-[calc(100dvh-5rem)]',
]) {
  assert.equal(source.includes(forbidden), false, `Agent checkout must not contain ${forbidden}`)
}

assert.doesNotMatch(controllerSource, /if \(next\.connected\)[\s\S]{0,120}setWalletStep\('done'\)/)
assert.match(layoutSource, /const isAgentCheckoutPage = pathname\.startsWith\('\/pay\/a\/'\)/)
assert.match(layoutSource, /const isPayPage = pathname === '\/pay' \|\| isAgentCheckoutPage/)
assert.match(layoutSource, /\(isAgentProfilePage \|\| isAgentCheckoutPage\)[\s\S]{0,100}privyAuthenticated/)

console.log('Agent checkout UI source smoke checks passed.')
