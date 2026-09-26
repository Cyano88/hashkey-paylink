import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {normalizePayoutAccount,pocketFiatCurrency} from '../src/pocket/lib/pocketFiatCorridors.ts'
import {isPocketBankVerifyRequest,isPocketPosCreateRequest} from '../src/pocket/lib/pocketSchemas.ts'
import {paymentReceiptView} from '../src/lib/paymentReceiptPdf.ts'
import {pocketActivityAmount} from '../src/pocket/lib/pocketActivityPresentation.ts'
assert.equal(normalizePayoutAccount('0772123456','UGX'),'256772123456')
assert.equal(normalizePayoutAccount('+256772123456','UGX'),'256772123456')
assert.equal(normalizePayoutAccount('772123456','UGX'),'256772123456')
assert.equal(normalizePayoutAccount('254772123456','UGX'),'')
assert.equal(normalizePayoutAccount('01234567890','NGN'),'')
assert.equal(pocketFiatCurrency('UG'),'UGX')
const req={currency:'UGX',bank_code:'MOMOUGPC',bank_name:'MTN Mobile Money',account_number:'0772123456'}
assert.equal(isPocketBankVerifyRequest(req),true)
assert.equal(isPocketBankVerifyRequest({...req,currency:'RWF'}),false)
assert.equal(isPocketPosCreateRequest({country:'UG',payout_preference:'INSTANT_FIAT',display_name:'Fixture',supported_networks:['base']}),true)
assert.equal(isPocketPosCreateRequest({country:'RW',payout_preference:'INSTANT_FIAT',display_name:'Fixture',supported_networks:['base']}),false)
assert.equal(pocketActivityAmount({amount:'1',amountNgn:'3900',fiatCurrency:'UGX',source:'ngpos'}),'UGX 3,900')
const receipt=paymentReceiptView({type:'test',receiptId:'fixture',receiptHash:'',title:'POS',status:'confirmed',eventId:'fixture',txHash:'',chain:'base',payer:'',memo:'',amount:'1',asset:'USDC',createdAt:0,source:'ngpos',amountNgn:'3900',fiatCurrency:'UGX'})
assert.ok(JSON.stringify(receipt).includes('UGX 3,900'));assert.ok(!JSON.stringify(receipt).includes('NGN'))
const dir=await mkdtemp(join(tmpdir(),'pocket-uganda-'))
process.env.PAYCREST_API_KEY='fixture-only'
process.env.PAYCREST_POS_STORE=join(dir,'orders.json')
process.env.DATABASE_URL='';process.env.RENDER='';process.env.RENDER_SERVICE_ID='';process.env.RENDER_EXTERNAL_URL=''
const original=globalThis.fetch;const calls=[]
try{
 globalThis.fetch=async(url,init)=>{const body=JSON.parse(init?.body||'{}');calls.push({url:String(url),body});return new Response(JSON.stringify({status:'success',data:String(url).endsWith('/verify-account')?'FIXTURE OWNER':{id:'fixture-order',status:'initiated',amountToPay:'1',providerAccount:{receiveAddress:'0x1111111111111111111111111111111111111111'}}}),{status:200,headers:{'content-type':'application/json'}})}
 const {verifyNgPosBankAccount}=await import('../api/ng-pos.ts')
 const verified=await verifyNgPosBankAccount(req);assert.equal(verified.account_name,'FIXTURE OWNER');assert.equal(calls.at(-1).body.accountIdentifier,'256772123456');assert.equal(calls.at(-1).body.currency,'UGX')
 await assert.rejects(verifyNgPosBankAccount({...req,bank_code:'OPAYNGPC'}),/supported Uganda/)
 const {createPaycrestOfframpOrder}=await import('../api/paycrest-pos.ts')
 const order=await createPaycrestOfframpOrder({intentId:'fixture',merchantId:'fixture',amountNgn:'3900',fiatCurrency:'UGX',estimatedAmountUsdc:'1',bankCode:'MOMOUGPC',accountNumber:'256772123456',accountName:'FIXTURE OWNER',refundAddress:'0x2222222222222222222222222222222222222222',source:'ngpos'})
 assert.equal(calls.at(-1).body.destination.currency,'UGX');assert.equal(calls.at(-1).body.amount,'3900');assert.equal(order.fiat_currency,'UGX')
 globalThis.fetch=async()=>new Response(JSON.stringify({status:'success',data:'OK'}),{status:200,headers:{'content-type':'application/json'}})
 await assert.rejects(verifyNgPosBankAccount(req),/Ownership cannot be verified/)
 console.log('PASS Uganda normalization, country boundaries, provider currency, receipt/activity labels and fail-closed name ownership. No live transactions.')
}finally{globalThis.fetch=original;await rm(dir,{recursive:true,force:true})}
