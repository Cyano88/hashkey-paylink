import assert from 'node:assert/strict'
import { arcMainnetStoreKey, requireArcMainnetCircleKey, requireArcMainnetAgreementRelease } from '../api/arc-mainnet-boundary.ts'
import { arcAgreementRuntimeConfig, assertArcAgreementNetwork } from '../api/arc-agreement-config.ts'
import { createArcAgreementOperatorClient } from '../api/arc-agreement-operator-client.ts'
import { authorizeArcAgreementActivation } from '../api/arc-agreement-activation-policy.ts'

assert.equal(arcMainnetStoreKey('agreements'), 'hashpaylink:arc-mainnet:5042:agreements:v1')
for (const key of ['hashpaylink:arc-agreements:v1', 'hashpaylink:arc-agreement-activation-attempts:v1', 'hashpaylink:hosted-checkouts:v2']) {
  assert.throws(() => arcMainnetStoreKey('agreements', key), /isolated/)
}
for (const key of [undefined, '', 'TEST_API_KEY:fixture:fixture', 'arbitrary']) {
  assert.throws(() => requireArcMainnetCircleKey(key), /production/)
}
assert.equal(requireArcMainnetCircleKey('LIVE_API_KEY:fixture:fixture'), 'LIVE_API_KEY:fixture:fixture')
assert.throws(() => createArcAgreementOperatorClient({ apiKey: 'TEST_API_KEY:fixture:fixture' }), /production/)
assert.throws(() => requireArcMainnetAgreementRelease(), /not been reviewed/)
assert.throws(() => authorizeArcAgreementActivation({ env: { ARC_AGREEMENTS_ENABLED: 'true' }, policy: {}, draft: {} }), /not been reviewed/)
assert.throws(() => arcAgreementRuntimeConfig({ ARC_AGREEMENT_FACTORY_ADDRESS: '0xe828795f52b3d6902b982ab7266aaae404d7cea5', ARC_AGREEMENT_OPERATOR_ADDRESS: '0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49' }), /ADDRESS_MAINNET/)
assert.throws(() => assertArcAgreementNetwork({ chainId: 5042002, usdc: '0x3600000000000000000000000000000000000000' }), /5042/)
assert.equal(assertArcAgreementNetwork({ chainId: 5042, usdc: '0x3600000000000000000000000000000000000000' }).chainId, 5042)
console.log('Arc mainnet boundary checks passed: retired stores, test credentials, old chain and unreviewed activation rejected.')
