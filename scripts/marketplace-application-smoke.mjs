import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {createMarketplaceService} from '../api/marketplace/application.ts'
let store={books:[],drafts:[]},quotes=[],now=100000,active=true
const projectId='dev_12345678',payer='0x'+'3'.repeat(40),holding='0x'+'4'.repeat(40)
const repo=createMarketplaceRepository({now:()=>now,read:async()=>structuredClone(store),mutate:async fn=>{store=fn(structuredClone(store));return structuredClone(store)},resolveWalletQuote:async q=>quotes.find(x=>x.quoteId===q.quoteId&&x.projectId===q.projectId&&x.paymentId===q.paymentId)||null,resolveRefundCollection:async q=>({...q,route:'wallet',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,amountUnits:'1000000',payerId:'payer_a',payerWallet:payer,holdingId:'holding_a',holdingRevision:'rev_a',holdingAddress:holding})})
const principal={projectId,credentialId:'key_a',active:true,capabilities:['marketplace_payments'],scopes:['marketplace:read','marketplace:create','marketplace:release','marketplace:payout','marketplace:refund']}
const service=createMarketplaceService({repository:repo,resolvePrincipal:async token=>active&&token==='credential'?principal:null,createCheckout:async(p,id)=>({checkoutId:'chk_fixture12345',checkoutUrl:'https://fixture.invalid/checkout',paymentId:id,amount:'1',network:'base',asset:'USDC',expiresAt:new Date(now+60000).toISOString()}),quoteWallet:async b=>({...b,quoteId:'quote_a',network:'base',asset:'USDC',feePayer:'allocation',feePolicy:'fixed_success_only',recipientUnits:(BigInt(b.debitUnits)-1000n).toString(),networkFeeUnits:'1000',issuedAt:now,expiresAt:now+60000}),saveQuote:async q=>{quotes.push(q)}})
for(const [id,key]of [['seller_a','1'],['platform_a','2']]){
 const wallet=privateKeyToAccount('0x'+key.repeat(64)),body={sellerId:id,beneficiaryId:id+'_wallet',address:wallet.address}
 await assert.rejects(()=>service.beginWallet('credential',{...body,projectId:'other'}),/Unexpected/)
 const challenge=await service.beginWallet('credential',body)
 await service.verifyWallet('credential',body.beneficiaryId,{nonce:challenge.nonce,signature:await wallet.signMessage({message:challenge.message})})
}
const payment={paymentId:'order_a',amount:'1',allocations:[{id:'seller_share',sellerId:'seller_a',role:'seller',amount:'0.9',beneficiaryId:'seller_a_wallet'},{id:'platform_share',sellerId:'platform_a',role:'platform',amount:'0.1',beneficiaryId:'platform_a_wallet'}]}
await service.createPayment('credential','create_a',payment);await service.createPayment('credential','create_a',payment);assert.equal(store.books.length,1)
await assert.rejects(()=>service.createPayment('credential','create_b',{...payment,asset:'USDT'}),/Unexpected/)
await repo.execute(projectId,'order_a','verified_fixture_collection',{type:'fund',asset:'USDC',network:'base',amountUnits:'1000000',evidenceId:'fixture_collection_a'})
await service.release('credential','release_a',{paymentId:'order_a',businessReference:'delivery_a',releases:[{allocationId:'seller_share',amount:'0.6'},{allocationId:'platform_share',amount:'0.1'}]})
const q=await service.createWalletQuote('credential','order_a',{allocationId:'seller_share',operationId:'payout_a',amount:'0.501'});assert.equal(q.quotedRecipientUnits,'500000')
await service.reserveQuotedWalletPayout('credential','reserve_a',{paymentId:'order_a',quoteId:q.quoteId,businessReference:'withdrawal_a'})
await service.fundRefundFees('credential','fees_a',{paymentId:'order_a',allocationId:'platform_share',amount:'0.01'})
const refund=await service.reserveRefund('credential','refund_a',{paymentId:'order_a',refundId:'refund_a',allocations:[{allocationId:'seller_share',amount:'0.03'}],businessReference:'return_a'})
assert.equal(refund.amountUnits,'30000');assert.equal(store.books[0].refundReservations[0].collection.payerWallet.toLowerCase(),payer)
await service.cancelPayout('credential','cancel_a',{paymentId:'order_a',operationId:'payout_a',businessReference:'cancelled_withdrawal'})
await service.revokeWallet('credential','seller_a_wallet');await assert.rejects(()=>service.createWalletQuote('credential','order_a',{allocationId:'seller_share',operationId:'payout_b',amount:'0.501'}),/eligible/)
const bankRequest={projectId,sellerId:'bank_seller',beneficiaryId:'verified_bank',bankCode:'TEST',accountNumber:'0123456789'}
const verifier=createMarketplaceBankVerifier({key:Buffer.alloc(32,17),keyId:'test_key',verifyAccount:async()=> 'Verified Test Seller',verifyOwnership:async()=>({...bankRequest,verified:true,evidenceId:'ownership_test'}),now:()=>now})
store.bankBeneficiaries=[await verifier.verify(bankRequest)]
const bankOrder={paymentId:'bank_order',amount:'2',allocations:[{id:'bank_share',sellerId:'bank_seller',role:'seller',amount:'1.8',beneficiaryId:'verified_bank',settlement:'cash_balance'},{id:'platform_share',sellerId:'platform_a',role:'platform',amount:'0.2',beneficiaryId:'platform_a_wallet'}]}
const bankDraft=await service.createPayment('credential','bank_order_create',bankOrder)
assert.equal(bankDraft.funded,false);assert.equal(bankDraft.plan.allocations[0].settlement,'cash_balance')
await service.createPayment('credential','bank_order_create',bankOrder)
assert.equal(store.books.filter(b=>b.plan.paymentId==='bank_order').length,1)
assert.equal(store.books.find(b=>b.plan.paymentId==='bank_order').beneficiarySnapshots[0].kind,'bank')
await service.createPayment('credential','create_a',payment) // Historical wallet request hash stays unchanged.
for(const patch of [{settlement:'USDT'},{settlement:'wallet_usdc'},{sellerId:'other_seller'},{beneficiaryId:'missing_bank'}])await assert.rejects(()=>service.createPayment('credential','bad_bank_order',{...bankOrder,paymentId:'bad_bank_order',allocations:[{...bankOrder.allocations[0],amount:'2',...patch}]}),/Invalid settlement|verified beneficiary/)
const bankOnly=await service.createPayment('credential','bank_only_create',{paymentId:'bank_only_order',amount:'1',allocations:[{...bankOrder.allocations[0],amount:'1'}]});assert.equal(bankOnly.plan.amountUnits,'1000000');assert.equal(bankOnly.funded,false)
store.bankBeneficiaries[0].status='revoked'
await assert.rejects(()=>service.createPayment('credential','revoked_bank_order',{...bankOrder,paymentId:'revoked_bank_order'}),/verified beneficiary/)
active=false;await assert.rejects(()=>service.payment('credential','order_a'),/denied/)
console.log('PASS verified EOA beneficiaries, fixed Base USDC drafts, duplicate creation, release, exact quoted payout, commission-funded fee balance, original-payer refund, cancellation and revocation. Bank-only/mixed creation, route validation, revoked and mismatched bank rejection, historical wallet idempotency. Synthetic collection only; no transfers.')
