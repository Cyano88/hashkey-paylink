import assert from 'node:assert/strict'
import {pocketMoneyNotification as notice} from '../src/pocket/lib/pocketMoneyNotification.ts'
import {upsertPocketNotice} from '../api/pocket/notification-store.ts'
import {pocketNotificationPath} from '../src/pocket/lib/pocketNotificationPath.ts'
const row={eventId:'bank',source:'bank-withdraw',chain:'base',payer:'fixture',memo:'Bank transfer',amount:'3.7',amountNgn:'5000',fiatCurrency:'NGN',accountName:'Emmanuel Onoja',bankName:'OPay',bankOrderId:'order',ts:1000,statusUpdatedAt:2000,txHash:'0x'+'1'.repeat(64),bankSettlementStatus:'settled',paycrestStatus:'successful',direction:'out'}
const n=notice(row);assert.equal(n.title,'Bank transfer successful');assert.equal(n.body,'Your \u20a65,000 transfer to Emmanuel Onoja at OPay was successful.');assert.equal(n.occurredAt,2000);assert.equal(n.path,'/activity?receipt=order')
assert.equal(notice({...row,bankSettlementStatus:'settling'}),null,'verified funding must not announce bank delivery')
assert.match(notice({...row,fiatCurrency:'UGX',amountNgn:'50000',bankName:'Airtel Money'}).body,/UGX 50,000.*Airtel Money/)
for(const category of ['airtime','data','tv','electricity']){const b={...row,source:'bills',bankSettlementStatus:undefined,paycrestStatus:'delivered',billCategory:category,billProvider:'Provider'};assert.match(notice(b).body,/purchase completed/);assert.equal(notice({...b,paycrestStatus:'processing'}),null);assert.equal(notice({...b,paycrestStatus:'refund available'}).title,'Refund available')}
assert.equal(notice({...row,fundingOnly:true}),null);assert.equal(notice({...row,source:'wallet-bridge',fundingParent:'bank-withdraw:one'}),null)
assert.match(notice({...row,source:'wallet-bridge',chain:'arc',destination:'base',bankSettlementStatus:undefined,paycrestStatus:'completed'}).body,/moved from Arc to Base/)
let items=upsertPocketNotice([],n.eventId,n,3000);items[0].readAt=3001;assert.equal(upsertPocketNotice(items,n.eventId,n,4000),items,'polling must preserve read status')
const refund=notice({...row,bankSettlementStatus:'refunded',statusUpdatedAt:5000});items=upsertPocketNotice(items,refund.eventId,refund,5001);assert.equal(items.length,1);assert.equal(items[0].readAt,undefined);assert.equal(upsertPocketNotice(items,n.eventId,n,6000),items,'late delivery cannot overwrite refund')
assert.equal(pocketNotificationPath(n.path),n.path);for(const path of ['https://evil.test/activity','//evil.test/activity','/activity/../../evil','/admin','/\\evil.test'])assert.equal(pocketNotificationPath(path),null)
console.log('PASS: NGN/UGX/bill wording, actual provider settlement, silent funding, standalone moves, versioned unread replacement and safe receipt links')
