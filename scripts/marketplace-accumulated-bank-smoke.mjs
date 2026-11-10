import assert from 'node:assert/strict'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceBankVerifier} from '../api/marketplace/bank-beneficiaries.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import {marketplaceBankReceipt} from '../api/marketplace/bank-receipt.ts'
let stored={books:[],drafts:[]},quote,evidence,now=1000000
const verifier=createMarketplaceBankVerifier({key:Buffer.alloc(32,11),keyId:'fixture_key',verifyAccount:async()=> 'Seller Test',verifyOwnership:async r=>({...r,verified:true,evidenceId:'fixture_ownership'})})
const repo=createMarketplaceRepository({read:async()=>structuredClone(stored),mutate:async fn=>{stored=fn(structuredClone(stored));return structuredClone(stored)},now:()=>now,verifyBank:verifier.verify,resolveBankQuote:async()=>quote,preflightBankExecution:async q=>({quote:q,holdingApproved:true,authorizationActive:true}),verifyBankOutcome:async()=>evidence})
await repo.registerBank({projectId:'project_one',sellerId:'seller_one',beneficiaryId:'bank_one',bankCode:'TESTBANK',accountNumber:'0123456789'})
for(let i=0;i<2;i++){const paymentId='order_'+i;await repo.create({projectId:'project_one',paymentId,network:'base',asset:'USDC',amount:'0.7',allocations:[{id:'share_one',sellerId:'seller_one',role:'seller',beneficiaryId:'old_wallet',settlement:'wallet_usdc',amount:'0.7'}]},'draft_'+i);await repo.execute('project_one',paymentId,'fund_'+i,{type:'fund',network:'base',asset:'USDC',amountUnits:'700000',evidenceId:'proof_'+i});await repo.execute('project_one',paymentId,'release_'+i,{type:'release',allocationId:'share_one',amountUnits:'700000'})}
const plan=await repo.planWithdrawal('project_one','seller_one','seller','bank_one','1110000')
quote={withdrawal:plan,quoteId:'quote_one',projectId:'project_one',paymentId:'order_0',allocationId:'share_one',operationId:'withdrawal_one',beneficiaryId:'bank_one',destinationDigest:plan.beneficiary.destinationDigest,provider:'paycrest',providerOrderId:'provider_one',intentId:'intent_one',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,currency:'NGN',debitUnits:'1110000',fundingUnits:'1100000',netUnits:'1000000',networkFeeUnits:'10000',feePolicy:'fixed_success_only',exchangeRate:'1500',feeUnits:'100000',maximumFeeUnits:'110000',feePayer:'allocation',ngnMinor:'150000',requestedNgnMinor:'150000',holdingId:'holding_one',holdingRevision:'revision_one',refundAddress:'0x'+'11'.repeat(20),fundingAddress:'0x'+'22'.repeat(20),issuedAt:now,expiresAt:now+300000,status:'initiated',submitted:false}
await repo.reserveBankPayout('project_one','order_0',quote.quoteId,'reserve_one',{credentialId:'credential_one',businessReference:'withdraw_requested'})
assert.equal(stored.books[0].balances[0].reserved,'700000');assert.equal(stored.books[1].balances[0].reserved,'410000')
const attempt=await repo.bankExecution.claim('project_one','order_0','withdrawal_one','worker_one');await repo.bankExecution.beginSubmission('project_one','order_0','withdrawal_one',attempt.claimToken)
evidence={evidenceId:'result_one',projectId:'project_one',paymentId:'order_0',operationId:'withdrawal_one',attemptId:attempt.attemptId,providerOrderId:'provider_one',holdingId:'holding_one',holdingRevision:'revision_one',destinationDigest:quote.destinationDigest,network:'base',asset:'USDC',currency:'NGN',basis:'bank_settled',providerFinal:true,fundingTransactionHash:'0x'+'ab'.repeat(32),fundingEvidenceId:'chain_one',providerEvidenceId:'provider_result_one',fundingUnits:'1100000',ngnPaidMinor:'150000',returnedUnits:'0',finalizedAt:now}
await repo.bankReconciliation.reconcile('project_one','order_0','withdrawal_one')
await repo.bankReconciliation.reconcile('project_one','order_0','withdrawal_one')
const balance=(await repo.sellerBalances('project_one','seller_one'))[0]
assert.equal(balance.units.available,'290000');assert.equal(balance.units.paid,'1100000');assert.equal(balance.units.feesAccrued,'10000');assert.equal(balance.units.reserved,'0')
assert.equal(stored.books.reduce((n,b)=>n+(b.bankEvents?.length??0),0),1)
const receipt=marketplaceBankReceipt(stored.books[0],'withdrawal_one');assert.equal(receipt.marketplaceBankFees.ngnPaidMinor,'150000');assert.equal(receipt.recipient,'Bank account ending 6789')
assert.equal(stored.books[0].plan.allocations[0].settlement,'wallet_usdc')
assert.equal(JSON.stringify(receipt).includes('0123456789'),false)
console.log('PASS pooled bank reservation, wallet-to-verified-bank destination choice, exact net minimum, distributed fees, one verified NGN outcome, replay, receipt and original-order preservation. Provider/ownership fixtures only.')
