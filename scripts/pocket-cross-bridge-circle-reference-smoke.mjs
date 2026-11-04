import assert from 'node:assert/strict'
import {validNativeSendReference} from '../api/pocket/native-send-challenge-recovery.ts'
import {circleKitApprovalNotSubmitted} from '../api/pocket/circle-bridge-transaction.ts'
const id='11111111-1111-4111-8111-111111111111'
for(const network of ['ethereum','base','arbitrum','polygon'])for(const kind of ['bridge','cross-bridge','xlayer-bridge','bsc-inbound-bridge','usdt-bridge','native-send','native-swap'])assert.equal(validNativeSendReference(network,`pocket:${kind}:${id}`),true)
assert.equal(validNativeSendReference('base',`pocket:cash-conversion:${id}`),true)
assert.equal(validNativeSendReference('polygon',`pocket:cash-conversion:${id}`),false)
for(const status of ['FAILED','EXPIRED','CANCELLED','CANCELED'])assert.equal(await circleKitApprovalNotSubmitted(id,async()=>({challenge:{id,status,correlationIds:[]}})),true)
for(const challenge of [{id,status:'PENDING',correlationIds:[]},{id,status:'EXPIRED'},{id,status:'EXPIRED',correlationIds:['transaction']}])assert.equal(await circleKitApprovalNotSubmitted(id,async()=>({challenge})),false)
await assert.rejects(()=>circleKitApprovalNotSubmitted(id,async()=>({challenge:{id:'another',status:'EXPIRED',correlationIds:[]}})))
for(const value of ['pocket:cross-bridge:bad','pocket:other:'+id,'pocket:cross-bridge:'+id+'/extra'])assert.equal(validNativeSendReference('base',value),false)
console.log('PASS real Circle reference boundary admits cross-bridge recovery and preserves existing namespace restrictions.')
