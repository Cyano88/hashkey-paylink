import assert from 'node:assert/strict'
import {canExpireUnusedCheckout} from '../api/pocket/checkout-expiry-evidence.ts'
const now=Date.parse('2026-11-01T00:00:00Z'),expiresAt=new Date(now-120000).toISOString()
const token={chainId:196,address:'0x'+'1'.repeat(40),symbol:'USDC',decimals:6}
const record={id:'chkx_'+'a'.repeat(24),partnerId:'merchant',network:'xlayer',asset:'USDC',amount:'1',token,expiresAt}
const intent={id:'pex_fixture',kind:'hosted_checkout',state:'prepared',ownerId:'partner:merchant',resourceId:record.id,sourceNetwork:'xlayer',settlementNetwork:'xlayer',asset:'USDC',amount:'1.000000',token,metadata:{}}
const evidence={xpay:[],bsc:[],journal:[],ledger:[{state:'prepared'}]}
assert.equal(canExpireUnusedCheckout(intent,record,evidence,now),true)
assert.equal(canExpireUnusedCheckout(intent,record,{...evidence,xpay:[{status:'ready',expiresAt:now-120000}]},now),true)
for(const mutation of [{state:'submitted'},{state:'authorized'},{state:'needs_review'},{transactionHash:'proof'},{providerReference:'provider'},{ownerId:'other'},{amount:'2'},{asset:'USDT'},{token:{...token,address:'0x'+'2'.repeat(40)}}])assert.equal(canExpireUnusedCheckout({...intent,...mutation},record,evidence,now),false,JSON.stringify(mutation))
for(const mutation of [{payment:{status:'paid'}},{expiresAt:'invalid'},{expiresAt:new Date(now).toISOString()},{network:'bsc'},{id:'different'}])assert.equal(canExpireUnusedCheckout(intent,{...record,...mutation},evidence,now),false)
for(const mutation of [{ledger:[]},{ledger:[{state:'submitted'}]},{ledger:[{state:'prepared',transaction_hash:'proof'}]},{journal:[{status:'started'}]},{xpay:[{status:'submitted'}]},{xpay:[{status:'paid'}]},{xpay:[{status:'failed'}]},{xpay:[{status:'ready',expiresAt:now-120000,authorizedAt:1}]},{xpay:[{status:'ready',expiresAt:now-120000,hash:'proof'}]},{xpay:[{status:'ready'}]},{bsc:[{state:'submitting'}]},{bsc:[{state:'pending'}]},{bsc:[{state:'completed'}]},{bsc:[{state:'prepared',quote:{expiresAt:now-120000},userOperationHash:'proof'}]}])assert.equal(canExpireUnusedCheckout(intent,record,{...evidence,...mutation},now),false,JSON.stringify(mutation))
const btoken={...token,chainId:56,decimals:18},bintent={...intent,resourceId:'chkb_'+'b'.repeat(24),sourceNetwork:'bsc',settlementNetwork:'bsc',token:btoken},brecord={...record,id:bintent.resourceId,network:'bsc',token:btoken}
assert.equal(canExpireUnusedCheckout(bintent,brecord,{...evidence,bsc:[{state:'prepared',quote:{expiresAt:now-120000}}]},now),true)
assert.equal(canExpireUnusedCheckout(bintent,brecord,{...evidence,bsc:[{state:'cancelled',quote:{expiresAt:now-120000},recoveryBlock:'0x123'}]},now),false)
console.log('PASS X Layer/BNB unused expiry; reject submitted, unknown, mismatched, missing ledger, paid and still-valid evidence')
