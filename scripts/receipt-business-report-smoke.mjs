import assert from 'node:assert/strict'
import {businessReceiptReport} from '../api/receipt-business-report.ts'
const holding='0x'+'1'.repeat(40),wallet='0x'+'2'.repeat(40),tx='0x'+'a'.repeat(64)
const allocations=[{id:'seller_a',sellerId:'a',role:'seller',amountUnits:'60000000'},{id:'seller_b',sellerId:'b',role:'seller',amountUnits:'30000000'},{id:'platform_a',sellerId:'platform',role:'platform',amountUnits:'10000000'}]
const quote={quoteId:'quote_a',projectId:'project_a',paymentId:'order_a',operationId:'op_a',allocationId:'seller_a',beneficiaryId:'beneficiary_a',recipient:wallet,asset:'USDC',network:'base',feePayer:'allocation',feePolicy:'fixed_success_only',debitUnits:'20000000',recipientUnits:'19000000',networkFeeUnits:'1000000',issuedAt:1000,expiresAt:61000}
const book={plan:{projectId:'project_a',paymentId:'order_a',network:'base',asset:'USDC',amountUnits:'100000000',allocations},collectionCheckout:{checkoutId:'chk_bound'},fundingEvidence:'proof_a',collectionProof:{evidenceId:'proof_a',verifiedAt:1000},refundCollection:{payerWallet:wallet,holdingAddress:holding,fundingEvidenceId:'proof_a'},balances:allocations.map(a=>({allocationId:a.id,pending:'0',available:a.id==='seller_a'?'40000000':a.amountUnits,reserved:'0',paid:a.id==='seller_a'?'20000000':'0',refunded:'0'})),operations:[{id:'op_a',allocationId:'seller_a',kind:'payout',status:'settled',units:'20000000'}],walletReservations:[{operationId:'op_a',allocationId:'seller_a',recipient:wallet,amountUnits:'19000000',quote}],walletReconciliations:[{status:'settled',evidence:{operationId:'op_a',transferredUnits:'19000000',transactionHash:tx,sender:holding,recipient:wallet,finalizedAt:1500}}]}
const direct={id:'chk_direct',partnerId:'project_a',network:'base',recipient:wallet,merchantName:'Shop',amount:'2',title:'Order',asset:'USDC',createdAt:new Date(100).toISOString(),payment:{status:'paid',payer:holding,txHash:tx,amount:'2',confirmedAt:new Date(1000).toISOString(),fees:{payer:'merchant',platformFee:'0.2',networkFee:'0.3',netAmount:'1.5'}}}
const base={projectId:'project_a',name:'Example Market',from:500,to:2000,generatedAt:3000,timeZone:'UTC',frequency:'daily',marketplace:{books:[book,{...structuredClone(book),plan:{...book.plan,projectId:'other_project'}}]},checkouts:[{record:direct,recordedAt:1000},{record:{...direct,id:'chk_bound'},recordedAt:1000},{record:{...direct,id:'other',partnerId:'other_project'},recordedAt:1000}]}
const operator=businessReceiptReport({...base,audience:'operator'}),seller=businessReceiptReport({...base,audience:'seller',sellerId:'a'})
const amount=(r,label)=>r.metrics.find(m=>m.label===label)?.amount
assert.equal(amount(operator,'Marketplace payments collected'),'100');assert.equal(amount(operator,'Seller earnings allocated'),'90');assert.equal(amount(operator,'Platform earnings allocated'),'10')
assert.equal(amount(operator,'Checkout sales'),'2');assert.equal(amount(operator,'Net checkout sales'),'1.5');assert.equal(amount(operator,'Merchant-paid processing fees'),'0.2')
assert.equal(amount(seller,'Sales allocated'),'60');assert.equal(amount(seller,'available balance'),'40');assert.equal(amount(seller,'wallet withdrawals received'),'19');assert.equal(amount(seller,'balance debited for withdrawals'),'20');assert.equal(amount(seller,'withdrawal network fees'),'1')
assert(!seller.metrics.some(m=>/Platform|Checkout|Seller earnings/.test(m.label)));assert.equal(seller.activityCount,2)
assert.equal(businessReceiptReport({...base,audience:'seller',sellerId:'stranger'}).activityCount,0)
assert.throws(()=>businessReceiptReport({...base,audience:'seller'}),/seller scope/)
const pending=structuredClone(book);delete pending.collectionProof;delete pending.fundingEvidence;pending.collectionStatus='pending_finality';pending.collectionObservation={};pending.operations=[]
assert.equal(businessReceiptReport({...base,audience:'operator',marketplace:{books:[pending]},checkouts:[]}).activityCount,0,'unfinalized collection is not a sale or payout')
const late=businessReceiptReport({...base,audience:'operator',from:2000,to:4000,generatedAt:5000});assert.equal(late.activityCount,0);assert.ok(late.metrics.every(m=>m.section==='current'))
console.log('PASS audience scope, seller allocations, platform earnings, fee ownership, direct/marketplace deduplication, unfinalized exclusion, and generation-time balances.')

const local={...direct,id:'chk_local',settlement:{mode:'ngn',amountNgn:'3000',netAmountNgn:'2900'},payout:{status:'settled'}}
const localReport=businessReceiptReport({...base,audience:'operator',marketplace:{books:[]},checkouts:[{record:local,recordedAt:1000}]})
assert.equal(amount(localReport,'Local settlement received'),'2900');assert.equal(amount(localReport,'Net checkout sales'),undefined,'local merchant did not receive the payer asset as a second net settlement')
const missing=structuredClone(local);delete missing.settlement.netAmountNgn
assert.throws(()=>businessReceiptReport({...base,audience:'operator',marketplace:{books:[]},checkouts:[{record:missing,recordedAt:1000}]}),/Local settlement amount/)
console.log('PASS local currency settlement is not double-counted as net stablecoin proceeds; missing settlement proof defers reporting.')
