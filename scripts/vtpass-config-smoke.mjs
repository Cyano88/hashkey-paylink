import assert from 'node:assert/strict'
import { publicVtpassPhase0Status, readVtpassPhase0Config } from '../api/vtpass-config.ts'

const base = {
  VTPASS_ENVIRONMENT: 'sandbox',
  VTPASS_API_BASE: 'https://sandbox.vtpass.com',
  VTPASS_API_KEY: 'api-key-secret',
  VTPASS_PUBLIC_KEY: 'PK_public',
  VTPASS_SECRET_KEY: 'SK_secret',
  POCKET_BILLS_ENABLED: 'false',
  VTPASS_SANDBOX_VENDING_ENABLED: 'false',
  VTPASS_LIVE_VENDING_ENABLED: 'false',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'false',
  POCKET_BILLS_REFUNDS_READY: 'false',
  CIRCLE_API_KEY: 'circle-api-key',
  CIRCLE_ENTITY_SECRET: 'ab'.repeat(32),
  POCKET_BILLS_TREASURY_WALLET_SET_IDEMPOTENCY_KEY: '980240be-d888-4d75-ad86-88531d9a36e7',
  POCKET_BILLS_TREASURY_WALLET_IDEMPOTENCY_KEY: '3c85923c-f25e-41f9-bd98-e76207246608',
  POCKET_BILLS_TREASURY_WALLET_SET_ID: '38f57bc0-57f0-4f4d-afb8-48d7bb40a30c',
  POCKET_BILLS_TREASURY_WALLET_ID: '54f095b9-17bc-4189-b4a1-0513e956d739',
  POCKET_BILLS_TREASURY_ADDRESS: '0x1111111111111111111111111111111111111111',
  POCKET_BILLS_MIN_NGN: '100',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '10000',
  VTPASS_MINIMUM_WALLET_BALANCE_NGN: '5000',
  POCKET_BILLS_STORE_KEY: 'hashpaylink:pocket-bills:test',
}

const sandbox = readVtpassPhase0Config(base)
assert.equal(sandbox.credentialsReady, true)
assert.equal(sandbox.policyReady, true)
assert.equal(sandbox.canReadProvider, true)
assert.equal(sandbox.canSandboxVend, false)
assert.equal(sandbox.canLiveVend, false)
assert.equal(sandbox.canVend, false)

const sandboxEnabled = readVtpassPhase0Config({
  ...base,
  VTPASS_SANDBOX_VENDING_ENABLED: 'true',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
})
assert.equal(sandboxEnabled.canSandboxVend, true)
assert.equal(sandboxEnabled.canLiveVend, false)
assert.equal(sandboxEnabled.canVend, true)

const unsafeSandbox = readVtpassPhase0Config({ ...base, VTPASS_LIVE_VENDING_ENABLED: 'true' })
assert.equal(unsafeSandbox.canVend, false)
assert.match(unsafeSandbox.issues.join(' '), /cannot be enabled in sandbox/i)

const liveDisabled = readVtpassPhase0Config({
  ...base,
  VTPASS_ENVIRONMENT: 'live',
  VTPASS_API_BASE: 'https://vtpass.com',
  POCKET_BILLS_ENABLED: 'true',
})
assert.equal(liveDisabled.canVend, false)

const liveEnabled = readVtpassPhase0Config({
  ...base,
  VTPASS_ENVIRONMENT: 'live',
  VTPASS_API_BASE: 'https://vtpass.com',
  POCKET_BILLS_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'true',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'true',
})
assert.equal(liveEnabled.canVend, true)
assert.equal(liveEnabled.canLiveVend, true)
assert.equal(liveEnabled.circleTreasuryReady, true)

const liveWithoutCircleTreasury = readVtpassPhase0Config({
  ...base,
  VTPASS_ENVIRONMENT: 'live',
  VTPASS_API_BASE: 'https://vtpass.com',
  POCKET_BILLS_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'true',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
  POCKET_BILLS_REFUNDS_READY: 'true',
  CIRCLE_ENTITY_SECRET: '',
  POCKET_BILLS_TREASURY_WALLET_ID: '',
})
assert.equal(liveWithoutCircleTreasury.canLiveVend, false)
assert.match(liveWithoutCircleTreasury.issues.join(' '), /developer-controlled treasury/i)

const noRefunds = readVtpassPhase0Config({
  ...base,
  VTPASS_ENVIRONMENT: 'live',
  VTPASS_API_BASE: 'https://vtpass.com',
  POCKET_BILLS_ENABLED: 'true',
  VTPASS_LIVE_VENDING_ENABLED: 'true',
  VTPASS_AIRTIME_WHITELIST_CONFIRMED: 'true',
})
assert.equal(noRefunds.canVend, false)

const wrongHost = readVtpassPhase0Config({ ...base, VTPASS_API_BASE: 'https://example.com' })
assert.equal(wrongHost.credentialsReady, false)
assert.equal(wrongHost.canReadProvider, false)

const invalidPolicy = readVtpassPhase0Config({
  ...base,
  POCKET_BILLS_TREASURY_ADDRESS: '',
  POCKET_BILLS_MIN_NGN: '2000',
  POCKET_BILLS_MAX_NGN: '1000',
  POCKET_BILLS_DAILY_LIMIT_NGN: '500',
})
assert.equal(invalidPolicy.policyReady, false)
assert.equal(invalidPolicy.canVend, false)

const publicStatus = publicVtpassPhase0Status(sandbox)
const serialized = JSON.stringify(publicStatus)
assert.doesNotMatch(serialized, /api-key-secret|PK_public|SK_secret/)

console.log('VTpass Phase 0 configuration smoke tests passed.')
