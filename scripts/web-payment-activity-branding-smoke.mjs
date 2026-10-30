import assert from 'node:assert/strict'
import {createPocketActivityHandler} from '../api/pocket/activity.ts'
import {pocketActivityReceipt} from '../src/pocket/lib/pocketReceipt.ts'
const base={eventId:'web-payment',receiptId:'saved-reference',txHash:'0x'+'a'.repeat(64),chain:'xlayer',payer:'payer',memo:'Web payment',amount:'1.5',assetSymbol:'USDT',ts:Date.now(),source:'hosted_checkout',settlementType:'hosted_checkout',merchantId:'chkx_'+'a'.repeat(24),merchantName:'Lunchroom',recipient:'Lunchroom',merchantImageUrl:'https://app.hashpaylink.com/brand/lunchroom.png',paymentMethod:'wallet',paycrestStatus:'confirmed'}
for(const direction of ['in','out'])for(const query of [{},{scope:'recent'}]){
const handler=createPocketActivityHandler({verifyUser:async()=>({userId:'fixture'}),readHistory:async()=>({payments:[{...base,direction}]})})
const res={statusCode:200,status(code){this.statusCode=code;return this},json(body){this.body=body;return this}}
await handler({method:'GET',headers:{},query},res);assert.equal(res.statusCode,200,JSON.stringify(res.body));const row=res.body.payments[0];assert.ok(row);assert.equal(row.merchantImageUrl,base.merchantImageUrl);assert.equal(row.merchantName,'Lunchroom');assert.equal(row.paymentMethod,'wallet');assert.equal(pocketActivityReceipt(row).referenceId,'saved-reference')
}
console.log('PASS actual Activity API preserves merchant image/name and payment method for payer/receiver, recent/full history, and original receipt reference.')
