import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceService} from '../api/marketplace/application.ts'
import {marketplaceWalletReceipt} from '../api/marketplace/wallet-receipt.ts'
import {walletTransferHash} from '../api/marketplace/wallet-execution.ts'
const oldWallet=privateKeyToAccount('0x'+'11'.repeat(32)),newWallet=privateKeyToAccount('0x'+'22'.repeat(32)),sender='0x'+'33'.repeat(20)
let stored={books:[],drafts:[]},quotes=[],now=1000000,outcome,queue=Promise.resolve(),count=0
const actor={credentialId:'credential_one',businessReference:'withdrawal_requested'}
const deps={resolveRefundCollection:async q=>({...q,route:'wallet',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,amountUnits:'400000',payerId:'payer_one',payerWallet:oldWallet.address,holdingId:'holding_one',holdingRevision:'revision_one',holdingAddress:sender}),now:()=>now,read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored));return structuredClone(stored)});queue=job.catch(()=>{});return job},resolveWalletQuote:async({quoteId})=>structuredClone(quotes.find(q=>q.quoteId===quoteId)),verifyWalletOutcome:async()=>structuredClone(outcome),preflightWalletExecution:async transfer=>({holdingId:'holding_one',holdingRevision:'revision_one',sender,feePolicyId:'policy_one',transferHash:walletTransferHash(transfer),expiresAt:now+60000,holdingApproved:true,authorizationActive:true,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'})}
let repo=createMarketplaceRepository(deps)
for(const [beneficiaryId,wallet] of [['wallet_old',oldWallet],['wallet_new',newWallet]]){const c=await repo.beginWalletVerification({projectId:'project_one',sellerId:'recipient_one',beneficiaryId,asset:'USDC',address:wallet.address});await repo.verifyWallet('project_one',beneficiaryId,c.nonce,await wallet.signMessage({message:c.message}))}
for(let i=0;i<5;i++){
 const paymentId='order_'+i
 await repo.createWithVerifiedWallets({projectId:'project_one',paymentId,network:'base',asset:'USDC',amount:'0.4',allocations:[{id:'seller_share',sellerId:'recipient_one',role:'seller',amount:'0.3',beneficiaryId:'wallet_old',settlement:'wallet_usdc'},{id:'platform_share',sellerId:'recipient_one',role:'platform',amount:'0.1',beneficiaryId:'wallet_old',settlement:'wallet_usdc'}]},'draft_'+i)
 await repo.execute('project_one',paymentId,'fund_'+i,{type:'fund',network:'base',asset:'USDC',amountUnits:'400000',evidenceId:'proof_'+i})
 await repo.execute('project_one',paymentId,'release_'+i,{type:'release_batch',releases:[{allocationId:'seller_share',amountUnits:'300000'},{allocationId:'platform_share',amountUnits:'100000'}],authorization:actor})
}
const service=createMarketplaceService({repository:repo,resolvePrincipal:async()=>({projectId:'project_one',credentialId:actor.credentialId,active:true,capabilities:['marketplace_payments'],scopes:['marketplace:read','marketplace:payout']}),createCheckout:async()=>{throw Error('not used')},quoteWallet:async b=>({...b,quoteId:'quote_'+(++count),asset:'USDC',network:'base',feePayer:'allocation',feePolicy:'fixed_success_only',recipientUnits:(BigInt(b.debitUnits)-1000n).toString(),networkFeeUnits:'1000',issuedAt:now,expiresAt:now+60000}),saveQuote:async q=>{quotes.push(structuredClone(q))}})
async function quote(operationId){return service.createWithdrawalQuote('credential',{sellerId:'recipient_one',role:'seller',beneficiaryId:'wallet_new',operationId,amount:'0.601'})}
await assert.rejects(()=>service.createWithdrawalQuote('credential',{sellerId:'recipient_one',role:'platform',beneficiaryId:'wallet_new',operationId:'platform_overdraw',amount:'0.501'}),/Insufficient/)
await assert.rejects(()=>service.createWithdrawalQuote('credential',{sellerId:'recipient_one',role:'seller',beneficiaryId:'wallet_new',operationId:'scope_override',amount:'0.601',projectId:'other_project'}),/Unexpected/)
let q=await quote('withdrawal_one');assert.equal(q.sourceCount,3);assert.equal(q.recipient,newWallet.address);assert.equal(q.quotedRecipientUnits,'600000')
stored.walletBeneficiaries.find(b=>b.beneficiaryId==='wallet_new').status='revoked'
await assert.rejects(()=>repo.walletPayouts.preview('project_one',q.paymentId,q.quoteId),/no longer eligible/)
stored.walletBeneficiaries.find(b=>b.beneficiaryId==='wallet_new').status='active'
const storedQuote=quotes.at(-1);assert.equal(storedQuote.withdrawal.sources.every(s=>s.allocationId==='seller_share'),true)
const race=await Promise.allSettled([repo.walletPayouts.reserveQuoted('project_one',q.paymentId,'reserve_one',q.quoteId,actor),repo.walletPayouts.reserveQuoted('project_one',q.paymentId,'reserve_two',q.quoteId,actor)])
assert.equal(race.filter(r=>r.status==='fulfilled').length,1)
assert.equal((await repo.sellerBalances('project_one','recipient_one'))[0].units.reserved,'601000')
await assert.rejects(()=>repo.refunds.reserve('project_one','order_0','refund_competing',{refundId:'refund_competing',allocations:[{allocationId:'seller_share',amount:'0.000001'}]},actor),/Insufficient/)
await assert.rejects(()=>repo.execute('project_one','order_1','fake_result',{type:'result',operationId:stored.books[1].operations[0].id,status:'failed',evidenceId:'fake_proof'}),/coordinated/)
await repo.cancelPayout('project_one',q.paymentId,'cancel_one',q.operationId,actor)
assert.equal((await repo.sellerBalances('project_one','recipient_one'))[0].units.reserved,'0')
q=await quote('withdrawal_success');await repo.walletPayouts.reserveQuoted('project_one',q.paymentId,'reserve_success',q.quoteId,actor)
assert.equal((await repo.walletPayouts.prepareTransfer('project_one',q.paymentId,q.operationId)).amountUnits,'600000')
let claim=await repo.walletExecution.claim('project_one',q.paymentId,q.operationId,'worker_one')
const begun=await repo.walletExecution.beginSubmission('project_one',q.paymentId,q.operationId,claim.claimToken)
assert.equal(stored.books.slice(0,3).every(b=>b.operations.at(-1).status==='unknown'),true)
await assert.rejects(()=>repo.cancelPayout('project_one',q.paymentId,'cancel_after_submit',q.operationId,actor),/not found|submitted/)
repo=createMarketplaceRepository(deps)
await assert.rejects(()=>repo.walletExecution.claim('project_one',q.paymentId,q.operationId,'worker_restart'),/reconciliation|reserved|unavailable/i)
const reservation=stored.books[0].walletReservations.at(-1)
outcome={projectId:'project_one',paymentId:q.paymentId,operationId:q.operationId,attemptId:begun.attempt.attemptId,holdingId:'holding_one',holdingRevision:'revision_one',transferHash:begun.attempt.executionAuthorization.transferHash,chainId:8453,asset:'USDC',tokenAddress:reservation.tokenAddress,sender,recipient:newWallet.address,requestedUnits:'600000',transferredUnits:'600000',transactionHash:'0x'+'aa'.repeat(32),blockHash:'0x'+'bb'.repeat(32),blockNumber:'100',logIndex:1,outcome:'transferred',finality:'finalized',finalizedAt:now}
await Promise.all([repo.walletReconciliation.reconcile('project_one',q.paymentId,q.operationId),repo.walletReconciliation.reconcile('project_one',q.paymentId,q.operationId)])
const totals=(await repo.sellerBalances('project_one','recipient_one'))[0]
assert.equal(totals.units.paid,'600000');assert.equal(totals.units.feesAccrued,'1000');assert.equal(totals.units.reserved,'0');assert.equal(totals.units.available,'1399000')
assert.equal(totals.withdrawalBalances.find(x=>x.role==='platform').availableUnits,'500000')
assert.equal(stored.books.reduce((n,b)=>n+(b.walletEvents?.length??0),0),1)
assert.equal(marketplaceWalletReceipt(stored.books[0],q.operationId).amount,'0.6')
assert.equal(stored.books.every(b=>b.beneficiarySnapshots[0].address===oldWallet.address),true)
// A definite failed transfer restores all sources and charges no fee.
q=await quote('withdrawal_failed');await repo.walletPayouts.reserveQuoted('project_one',q.paymentId,'reserve_failed',q.quoteId,actor)
claim=await repo.walletExecution.claim('project_one',q.paymentId,q.operationId,'worker_fail');const failed=await repo.walletExecution.beginSubmission('project_one',q.paymentId,q.operationId,claim.claimToken)
outcome={...outcome,paymentId:q.paymentId,operationId:q.operationId,attemptId:failed.attempt.attemptId,transferHash:failed.attempt.executionAuthorization.transferHash,transactionHash:'0x'+'cc'.repeat(32),transferredUnits:'0',logIndex:null,outcome:'reverted'}
await repo.walletReconciliation.reconcile('project_one',q.paymentId,q.operationId)
assert.equal((await repo.sellerBalances('project_one','recipient_one'))[0].units.available,'1399000')
console.log('PASS accumulated withdrawals: small-order funding, role isolation, verified destination change, atomic race, refund exclusion, cancellation, unknown/restart, one transfer outcome, exact distributed fees, one event, receipt and full failure restoration.')
