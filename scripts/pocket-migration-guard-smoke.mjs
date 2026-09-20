import assert from 'node:assert/strict'
import {assertWalletHoldAllowed} from '../api/pocket/wallet-migration-guard.ts'
assert.doesNotThrow(()=>assertWalletHoldAllowed(undefined))
const hold={userId:'owner',revision:'review',walletId:'old',createdAt:1}
assert.throws(()=>assertWalletHoldAllowed(hold),/being updated/)
assert.doesNotThrow(()=>assertWalletHoldAllowed(hold,{userId:'owner',revision:'review'}))
assert.throws(()=>assertWalletHoldAllowed(hold,{userId:'other',revision:'review'}),/being updated/)
assert.throws(()=>assertWalletHoldAllowed(hold,{userId:'owner',revision:'new'}),/being updated/)
console.log('PASS: ordinary mutation, matching migration, other owner and changed review hold checks. Synthetic only.')
