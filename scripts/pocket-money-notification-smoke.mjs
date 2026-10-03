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
assert.match(notice({...row,source:'wallet-bridge',chain:'arc',destination:'base',bankSettlementStatus:undefined,paycrestStatus:'completed'}).body,/bridged from Arc to Base/)
let items=upsertPocketNotice([],n.eventId,n,3000);items[0].readAt=3001;assert.equal(upsertPocketNotice(items,n.eventId,n,4000),items,'polling must preserve read status')
const refund=notice({...row,bankSettlementStatus:'refunded',statusUpdatedAt:5000});items=upsertPocketNotice(items,refund.eventId,refund,5001);assert.equal(items.length,1);assert.equal(items[0].readAt,undefined);assert.equal(upsertPocketNotice(items,n.eventId,n,6000),items,'late delivery cannot overwrite refund')
assert.equal(pocketNotificationPath(n.path),n.path);for(const path of ['https://evil.test/activity','//evil.test/activity','/activity/../../evil','/admin','/\\evil.test'])assert.equal(pocketNotificationPath(path),null)
console.log('PASS: NGN/UGX/bill wording, actual provider settlement, silent funding, standalone moves, versioned unread replacement and safe receipt links')

assert.equal(pocketNotificationPath('/activity/collections?kind=requests'),'/activity/collections?kind=requests')
assert.equal(pocketNotificationPath('/activity/collections?kind=anything'),null)

const giftNotice=notice({...row,eventId:'gift-1',source:'gift',amount:'0.1',direction:'out',bankSettlementStatus:undefined,paycrestStatus:'completed',feeAmount:'0.00025'})
assert.equal(giftNotice.title,'Gift funded');assert.equal(giftNotice.body,'Your 0.1 USDC gift is ready to share.');assert(!giftNotice.body.includes('0.00025'))
assert.equal(notice({...row,source:'gift',amount:'0.1',direction:'in',bankSettlementStatus:undefined,paycrestStatus:'completed'}).title,'Gift received')
assert.equal(notice({...row,source:'gift',amount:'0.1',bankSettlementStatus:undefined,paycrestStatus:'refunded'}).title,'Gift refunded')
assert.equal(notice({...row,source:'gift',bankSettlementStatus:undefined,paycrestStatus:'processing'}),null)
console.log('PASS gift pushes describe funded, received and refunded principal only; no pending or fee announcement.')

assert.equal(pocketNotificationPath('/assistant?case=pcs_1874fda2f8564b26'),'/assistant?case=pcs_1874fda2f8564b26')
assert.equal(pocketNotificationPath('/assistant?case=pcs_1874fda2f8564b26&redirect=https://evil.test'),'/assistant?case=pcs_1874fda2f8564b26')
for(const path of ['/assistant','/assistant?case=other','/assistant?case=../admin','/assistant?case=pcs_1874fda2f8564b26%2fadmin'])assert.equal(pocketNotificationPath(path),null)
console.log('PASS support push case route preserved and invalid destinations rejected')
const stockGift={eventId:'stock-gift',source:'gift',chain:'xlayer',amount:'0.000009999999999999',assetSymbol:'NVDAx',ts:1000,txHash:'0x'+'2'.repeat(64),paycrestStatus:'completed',direction:'in'}
assert.equal(notice(stockGift).body,'0.00001 NVDAx has been added to your Pocket.')
assert.equal(notice({...stockGift,direction:'out'}).body,'Your 0.00001 NVDAx gift is ready to share.')
assert.equal(notice({...stockGift,paycrestStatus:'refunded'}).body,'0.00001 NVDAx from your unclaimed gift has been returned to your Pocket.')
assert.equal(notice({...stockGift,paycrestStatus:'pending'}),null)
assert.equal(stockGift.amount,'0.000009999999999999','display formatting must not mutate exact accounting')
assert.equal(notice({...stockGift,source:'wallet-deposit'}).title,'NVDAx received')
assert.match(notice({...stockGift,source:'wallet-deposit'}).body,/on X Layer/)
console.log('PASS stock gift and transfer push display, status gating and unchanged exact quantity')
