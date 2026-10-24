import assert from 'node:assert/strict'
import {isPocketBankActivityVisible} from '../src/pocket/lib/pocketBankActivityVisibility.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
const base={eventId:'unfunded',chain:'base',payer:'fixture',amount:'1',ts:1,source:'bank-withdraw',txHash:'',direction:'out'}
const ghost=['expired','cancelled','canceled','failed','pending'].map((paycrestStatus,i)=>({...base,eventId:'unfunded-'+i,paycrestStatus}))
assert(ghost.every(row=>!isPocketBankActivityVisible(row)))
const funded=['failed','refunded','settled','pending'].map((paycrestStatus,i)=>({...base,eventId:'funded-'+i,providerReference:'payout-'+i,txHash:'0x'+String(i+1).repeat(64),paycrestStatus}))
const unrelated={...base,eventId:'other',source:'bank-receive',paycrestStatus:'pending'}
assert.deepEqual(mergePocketActivityRows([...ghost,...funded],[unrelated]).map(r=>r.eventId).sort(),[...funded,unrelated].map(r=>r.eventId).sort())
assert.equal(mergePocketActivityRows([],ghost).length,0)
assert(isPocketBankActivityVisible({...base,handoffVerified:true}))
console.log('PASS unfunded bank preparations excluded from new and cached activity; funded failures, refunds, pending and settled transfers preserved')
