import assert from 'node:assert/strict'
import {inspectRequestMigration} from './pocket-request-migration-preflight.mjs'
const action={action:'create-usdc-paylink',resourceId:'request-1',ownerId:'owner-1',idempotencyKey:'idempotency-1'}
const journal={actions:[action]}
assert.equal(inspectRequestMigration({requests:{}},journal).readyForReviewedMigration,false)
const record={id:'request-1',wallet:'synthetic-wallet',payUrl:'https://example.test/pay',network:'arc',label:'Synthetic',mode:'person',createdAt:1,ownerId:'owner-1',idempotencyKey:'idempotency-1'}
assert.equal(inspectRequestMigration({requests:{'request-1':record}},journal).readyForReviewedMigration,true)
assert.equal(inspectRequestMigration({requests:{'request-1':{...record,ownerId:'different'}}},journal).identityConflicts,1)
assert.equal(inspectRequestMigration({requests:{'request-1':{...record,payUrl:''}}},journal).malformedRecords,1)
assert.throws(()=>inspectRequestMigration({requests:[]},journal))
console.log('Migration preflight passed: missing history and identity conflicts block cutover')
