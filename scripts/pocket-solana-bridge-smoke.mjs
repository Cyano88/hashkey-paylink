import assert from 'node:assert/strict'
import { findPocketBridgeSourceHash } from '../src/pocket/lib/pocketBridgeHash.ts'

const solanaSignature = '5'.repeat(88)
const evmHash = `0x${'a'.repeat(64)}`

assert.equal(findPocketBridgeSourceHash(solanaSignature), solanaSignature)
assert.equal(findPocketBridgeSourceHash({ steps: [{ name: 'burn', explorerUrl: `https://solscan.io/tx/${solanaSignature}?cluster=mainnet` }] }), solanaSignature)
assert.equal(findPocketBridgeSourceHash({ steps: [{ name: 'burn', explorerUrl: `https://basescan.org/tx/${evmHash}` }] }), evmHash)
assert.equal(findPocketBridgeSourceHash({ state: 'error', steps: [{ name: 'burn', errorMessage: 'Rejected' }] }), null)

console.log('Pocket Solana bridge hash recovery smoke tests passed.')
