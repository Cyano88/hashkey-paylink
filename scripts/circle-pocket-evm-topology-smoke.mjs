import assert from 'node:assert/strict'
import {
  auditPocketProductionEvmWallets,
  linkedPocketEvmStatus,
  POCKET_CANONICAL_EVM_REF_ID,
} from '../src/lib/circleEvmWalletTopology.ts'

const base = address => ({ id: `base-${address.slice(-4)}`, address, blockchain: 'BASE', accountType: 'SCA' })
const arbitrum = address => ({ id: `arb-${address.slice(-4)}`, address, blockchain: 'ARB', accountType: 'SCA' })
const first = '0x1111111111111111111111111111111111111111'
const second = '0x2222222222222222222222222222222222222222'

assert.equal(linkedPocketEvmStatus({}), 'not-opened')
assert.equal(linkedPocketEvmStatus({ base: first }), 'incomplete')
assert.equal(linkedPocketEvmStatus({ base: first, arbitrum: first.toUpperCase() }), 'unified')
assert.equal(linkedPocketEvmStatus({ base: first, arbitrum: second }), 'migration-required')

assert.deepEqual(auditPocketProductionEvmWallets([]), {
  status: 'empty',
  wallets: {},
  legacyWallets: [],
  migrationRequired: false,
})

const single = auditPocketProductionEvmWallets([base(first)])
assert.equal(single.status, 'single-network')
assert.equal(single.migrationRequired, true)
assert.equal(single.wallets.base.address, first)

const split = auditPocketProductionEvmWallets([base(first), arbitrum(second)])
assert.equal(split.status, 'split')
assert.equal(split.migrationRequired, true)
assert.equal(split.canonicalAddress, undefined)

const unified = auditPocketProductionEvmWallets([base(first), arbitrum(first)])
assert.equal(unified.status, 'unified')
assert.equal(unified.migrationRequired, false)
assert.equal(unified.canonicalAddress, first)

const canonicalBase = { ...base(second), id: 'canonical-base', refId: POCKET_CANONICAL_EVM_REF_ID }
const canonicalArbitrum = { ...arbitrum(second), id: 'canonical-arb', refId: POCKET_CANONICAL_EVM_REF_ID }
const migrated = auditPocketProductionEvmWallets([
  base(first),
  arbitrum(first),
  canonicalBase,
  canonicalArbitrum,
  { id: 'base-eoa', address: '0x3333333333333333333333333333333333333333', blockchain: 'BASE', accountType: 'EOA' },
])
assert.equal(migrated.status, 'unified')
assert.equal(migrated.canonicalAddress, second)
assert.equal(migrated.migrationRequired, true)
assert.deepEqual(migrated.legacyWallets.map(wallet => wallet.id).sort(), ['arb-1111', 'base-1111'])

console.log('Circle Pocket unified EVM topology smoke tests passed.')
