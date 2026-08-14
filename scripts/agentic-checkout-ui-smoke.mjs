import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/pages/AgentCheckoutPage.tsx', import.meta.url), 'utf8')
const controllerSource = readFileSync(new URL('../src/pocket/controllers/usePocketX402Controller.ts', import.meta.url), 'utf8')
const layoutSource = readFileSync(new URL('../src/Layout.tsx', import.meta.url), 'utf8')
const checkoutStepsSource = readFileSync(new URL('../src/components/CheckoutSteps.tsx', import.meta.url), 'utf8')

for (const required of [
  'usePocketIdentity',
  'usePocketX402Controller',
  'SlideAction',
  '/api/v2/checkouts/agent/pay',
  'USDC balance',
  'App Pay balance',
  'Copy deposit address',
  'Continue to {checkout.merchantName}',
  'Review payment',
  'Slide to pay',
  'connectionAttempts < 3',
  'Hash PayLink could not reach secure checkout',
  "footer={<CheckoutSteps steps={['Sign in', 'Review payment', 'Slide to pay']} />}",
  "Circle's minimum App Pay transfer is 0.5 USDC.",
  '<span>Secure</span>',
  '<Lock className="h-2.5 w-2.5"',
  'Check App Pay',
  'activationNeedsCheck',
  "x402.walletStep === 'done'",
  '<PocketPillMark',
]) {
  assert.ok(source.includes(required), `Agent checkout must retain ${required}`)
}

assert.ok(checkoutStepsSource.includes('How it works'), 'Shared checkout steps must retain How it works')
assert.ok(checkoutStepsSource.includes('aria-label="How it works"'), 'Shared checkout steps must remain accessible')

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
  'Verified against the status used by signed webhooks',
  'src="/pocket-circle.png"',
  'CheckoutHowItWorks',
]) {
  assert.equal(source.includes(forbidden), false, `Agent checkout must not contain ${forbidden}`)
}

assert.doesNotMatch(controllerSource, /if \(next\.connected\)[\s\S]{0,120}setWalletStep\('done'\)/)
assert.equal(controllerSource.includes('Pull down to check'), false)
assert.ok(controllerSource.includes('Check the balance before starting another transfer.'))
assert.match(layoutSource, /const isAgentCheckoutPage = pathname\.startsWith\('\/pay\/a\/'\)/)
assert.match(layoutSource, /const isCheckoutPage = pathname === '\/pay' \|\| isAgentCheckoutPage \|\| isHostedCheckoutEntryPage/)
assert.match(layoutSource, /isPocketLandingPage \|\| isPocketImmersivePage \|\| isCheckoutPage/)
assert.match(layoutSource, /agentHashComposerFocused \|\| isPocketAppPage \|\| isCheckoutPage/)
assert.match(layoutSource, /className=\{isPocketLandingPage \|\| isPocketImmersivePage \|\| isCheckoutPage[\s\S]{0,40}\? 'hidden'/)
assert.match(layoutSource, /agentHashComposerFocused \|\| isPocketAppPage \|\| isCheckoutPage \|\| isNgPosPage \? 'hidden' : 'flex'/)

console.log('Agent checkout UI source smoke checks passed.')
