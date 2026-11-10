import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
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
await service.release('credential','release_a',{paymentId:'order_a',businessReference:'delivery_a',releases:[{allocationId:'seller_share',amount:'0.1'},{allocationId:'platform_share',amount:'0.1'}]})
const q=await service.createWalletQuote('credential','order_a',{allocationId:'seller_share',operationId:'payout_a',amount:'0.02'});assert.equal(q.quotedRecipientUnits,'19000')
await service.reserveQuotedWalletPayout('credential','reserve_a',{paymentId:'order_a',quoteId:q.quoteId,businessReference:'withdrawal_a'})
await service.fundRefundFees('credential','fees_a',{paymentId:'order_a',allocationId:'platform_share',amount:'0.01'})
const refund=await service.reserveRefund('credential','refund_a',{paymentId:'order_a',refundId:'refund_a',allocations:[{allocationId:'seller_share',amount:'0.03'}],businessReference:'return_a'})
assert.equal(refund.amountUnits,'30000');assert.equal(store.books[0].refundReservations[0].collection.payerWallet.toLowerCase(),payer)
await service.cancelPayout('credential','cancel_a',{paymentId:'order_a',operationId:'payout_a',businessReference:'cancelled_withdrawal'})
await service.revokeWallet('credential','seller_a_wallet');await assert.rejects(()=>service.createWalletQuote('credential','order_a',{allocationId:'seller_share',operationId:'payout_b',amount:'0.02'}),/eligible/)
active=false;await assert.rejects(()=>service.payment('credential','order_a'),/denied/)
console.log('PASS verified EOA beneficiaries, fixed Base USDC drafts, duplicate creation, release, exact quoted payout, commission-funded fee balance, original-payer refund, cancellation and revocation. Synthetic collection only; no transfers.')
