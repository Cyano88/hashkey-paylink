import assert from 'node:assert/strict'
import {parsePocketScanCode,pocketScanDestination} from '../src/pocket/lib/pocketScanCode.ts'
import {resolvePocketPosCheckout} from '../api/pocket/scan-checkout.ts'
const url='https://app.hashpaylink.com/pay?src=ngpos&merchant=pos_example&f=1'
assert.equal(parsePocketScanCode(url).kind,'pos')
assert.equal(parsePocketScanCode('https://app.hashpaylink.com/pay/c/chk_abcdefgh').kind,'checkout')
assert.ok(pocketScanDestination(url).startsWith('/home/scan?code='))
for(const raw of ['javascript:alert(1)','https://evil.invalid/pay?src=ngpos&merchant=x','https://app.hashpaylink.com.evil.invalid/pay?src=ngpos&merchant=x','https://evil@app.hashpaylink.com/pay?src=ngpos&merchant=x','http://app.hashpaylink.com/pay?src=ngpos&merchant=x',url+'&merchant=other','https://app.hashpaylink.com/pay?e=0x123',url+'#redirect','https://app.hashpaylink.com:444/pay?src=ngpos&merchant=x'])assert.throws(()=>parsePocketScanCode(raw))
const merchant={merchant_id:'pos_example',display_name:'Verified shop',source:'pos',payout_preference:'KEEP_CRYPTO',settlement_enabled:true,circle_smart_wallet_address:'0x'+'1'.repeat(40),supported_networks:['base','arbitrum','arc']}
let result=resolvePocketPosCheckout(merchant,url+'&e=0x'+'2'.repeat(40)+'&m=Fake&settlement=instant_fiat')
let p=new URL(result.paymentUrl,'https://app.hashpaylink.com').searchParams
assert.equal(result.merchantName,'Verified shop');assert.equal(p.get('e'),merchant.circle_smart_wallet_address);assert.equal(p.get('m'),'Verified shop');assert.equal(p.get('settlement'),'keep_crypto');assert.equal(p.get('f'),'1')
p=new URL(resolvePocketPosCheckout(merchant,url.replace('&f=1','&a=1.234567')).paymentUrl,'https://app.hashpaylink.com').searchParams;assert.equal(p.get('a'),'1.234567');assert.equal(p.has('f'),false)
for(const amount of ['-1','1e3','0','1.0000001','Infinity'])assert.throws(()=>resolvePocketPosCheckout(merchant,url+'&a='+amount))
for(const change of [{settlement_enabled:false},{source:'bank-withdraw'},{kyc_status:'RESTRICTED'},{merchant_id:'other'},{circle_smart_wallet_address:'bad'}])assert.throws(()=>resolvePocketPosCheckout({...merchant,...change},url))
assert.throws(()=>resolvePocketPosCheckout(merchant,url+'&n=solana'))
const fiat={...merchant,payout_preference:'INSTANT_FIAT',encrypted_bank_details:{},bank_name:'Bank',bank_last4:'1234',bank_account_name:'Shop'}
p=new URL(resolvePocketPosCheckout(fiat,url).paymentUrl,'https://app.hashpaylink.com').searchParams;assert.equal(p.get('n'),'base');assert.equal(p.get('offramp'),'paycrest');assert.equal(p.get('fx'),'NGN');assert.equal(p.has('e'),false)
const intent={merchant_id:'pos_example',amount_ngn:'1000.00',estimated_amount_usdc:'0.7',expires_at:new Date(Date.now()+60000).toISOString()}
p=new URL(resolvePocketPosCheckout(fiat,url+'&intent=quote&a=999',intent).paymentUrl,'https://app.hashpaylink.com').searchParams;assert.equal(p.get('a'),'0.7');assert.equal(p.get('ngn'),'1000.00')
assert.throws(()=>resolvePocketPosCheckout(fiat,url+'&intent=quote',{...intent,expires_at:'2000-01-01'}))
assert.throws(()=>resolvePocketPosCheckout(fiat,url+'&intent=quote',{...intent,merchant_id:'another'}))
assert.throws(()=>resolvePocketPosCheckout(fiat,url+'&ngn=1000'))
console.log('PASS: allowlisted QR parsing, canonical merchant/recipient/settlement, fixed/open amounts, quote ownership/expiry, unsupported chains and hostile URLs.')
