import assert from 'node:assert/strict'
import { pocketWalletPreparationNotice as notice } from '../src/pocket/lib/pocketWalletPreparationNotice.ts'
const wallet=address=>({address})
const same={base:wallet('0xabc'),arbitrum:wallet('0xAbC'),arc:wallet('0xabc')}
const split={...same,base:wallet('0xdef')}
assert.equal(notice('hidden',split),'prepare')
assert.equal(notice('hidden',same),'hidden')
assert.equal(notice('hidden',{base:split.base}),'hidden')
assert.equal(notice('resume',split),'resume')
assert.equal(notice('available',split),'available')
console.log('PASS split addresses expose preparation; matching and incomplete wallets do not; saved migration notices retain priority.')
assert.equal(notice('hidden',{...same,ethereum:wallet('0xdef')}),'prepare');assert.equal(notice('hidden',{...same,ethereum:wallet('0xabc'),polygon:wallet('0xdef')}),'prepare');assert.equal(notice('hidden',{...same,ethereum:wallet('0xabc'),polygon:wallet('0xabc')}),'hidden');
