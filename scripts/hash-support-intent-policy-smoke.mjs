import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
assert.equal(readFileSync('api/hash-support/intent-policy.mjs','utf8'),readFileSync('services/hash-support/intent-policy.mjs','utf8'),'Standalone and Pocket privacy policy must match')
console.log('PASS standalone/Pocket intent policy parity')
