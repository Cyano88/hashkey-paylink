import assert from 'node:assert/strict'
import {checkoutActivityRows} from '../api/pocket/checkout-activity.ts'
import {cacheCheckoutConfirmationActivity as seed} from '../src/pocket/lib/pocketCheckoutConfirmationActivity.ts'
import {cachedPocketActivity,subscribePocketActivity} from '../src/pocket/lib/pocketActivityCache.ts'
const store=new Map();globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}
const payer='0x'+'a'.repeat(40),hash='0x'+'c'.repeat(64),email='fixture@test.example'
const record={id:'chk_seedfixture',partnerId:'fixture',merchantName:'Shop',title:'Fixture',amount:'1.43',asset:'USDC',network:'base',recipient:payer,createdAt:new Date().toISOString(),expiresAt:new Date().toISOString(),checkoutMode:'human',payment:{status:'paid',txHash:hash,payer,amount:'1.43',network:'base',confirmedAt:new Date().toISOString(),fees:{payer:'merchant',platformFee:'0.003575',networkFee:'0.01153',netAmount:'1.414895'}}}
const rows=checkoutActivityRows(record,[payer]);let notified=0;subscribePocketActivity(email,()=>notified++)
for(const value of [null,{},[{}],rows.map(r=>({...r,merchantId:'wrong'})),rows.map(r=>({...r,txHash:'wrong'})),rows.map(r=>({...r,payer:'wrong'})),rows.map(r=>({...r,paycrestStatus:'pending'}))])assert.equal(seed(email,record.id,hash,payer,value),false)
assert.equal(cachedPocketActivity(email),undefined)
assert.equal(seed(email,record.id,hash,payer,rows),true)
assert.equal(notified,2,'subscribers notified synchronously before caller can render success')
assert.equal(cachedPocketActivity(email).payments.length,2)
assert.equal(cachedPocketActivity(email).payments.find(r=>r.direction==='in').amount,'1.414895')
assert.equal(seed(email,record.id,hash,payer,rows),true)
assert.equal(cachedPocketActivity(email).payments.length,2,'replayed confirmation cannot duplicate rows')
assert.equal(cachedPocketActivity('other@test.example'),undefined)
assert.equal(store.size,1,'same account snapshot persisted for navigation/restart')
console.log('PASS canonical confirmation cache: immediate notification, exact transfer filtering, pending rejection, merchant net, replay deduplication and account isolation. No payment submitted.')
