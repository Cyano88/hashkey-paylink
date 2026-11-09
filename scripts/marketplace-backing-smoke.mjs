import assert from 'node:assert/strict'
import {createMarketplaceBackingCheck} from '../api/marketplace/backing.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
const address='0x'+'22'.repeat(20),bills='0x'+'33'.repeat(20),hash='0x'+'aa'.repeat(32)
const book={fundingEvidence:'proof_a',plan:{network:'base',asset:'USDC',amountUnits:'10000000',allocations:[{id:'share_a',amountUnits:'10000000'}]},balances:[{allocationId:'share_a',pending:'5000000',available:'3000000',reserved:'1000000',paid:'500000',refunded:'500000'}],operations:[],refundCollection:{holdingId:'holding_a',holdingRevision:'revision_a',holdingAddress:address,fundingEvidenceId:'proof_a',asset:'USDC',amountUnits:'10000000',tokenAddress:BASE_STABLECOINS.USDC.address},collectionProof:{evidenceId:'proof_a',blockNumber:'90'}}
let stored,balance,mutateDuring,chainId,canonicalHash
function reset(){stored={books:[structuredClone(book)],drafts:[]};balance=9000000n;mutateDuring=false;chainId=8453;canonicalHash=hash}
reset()
const checker=createMarketplaceBackingCheck({holding:{id:'holding_a',revision:'revision_a',address,billsAddress:bills},read:async()=>structuredClone(stored),chain:{getChainId:async()=>chainId,getBlock:async input=>({number:100n,hash:input.blockTag?hash:canonicalHash}),readContract:async input=>{assert.equal(input.blockNumber,100n);assert.equal(input.address,BASE_STABLECOINS.USDC.address);assert.equal(input.args[0],address);if(mutateDuring)stored.books[0].operations.push({status:'unknown'});return balance}}})
let result=await checker();assert.equal(result.backed,true);assert.equal(result.obligationUnits,'9000000')
balance=8999999n;result=await checker();assert.equal(result.backed,false);assert.equal(result.shortfallUnits,'1')
for(const [change,blocker] of [[()=>delete stored.books[0].refundCollection,'unverified_ledger_origin'],[()=>stored.books[0].refundCollection.holdingRevision='old','other_holding_requires_separate_reconciliation'],[()=>stored.books[0].collectionProof.blockNumber='101','ledger_ahead_of_finalized_snapshot'],[()=>stored.books[0].operations.push({status:'unknown'}),'unresolved_submission'],[()=>mutateDuring=true,'ledger_changed_during_check'],[()=>canonicalHash='0x'+'bb'.repeat(32),'chain_snapshot_changed']]){reset();change();result=await checker();assert.equal(result.backed,false);assert.ok(result.blockers.includes(blocker))}
reset();stored.books[0].balances[0].pending='-1';await assert.rejects(checker,/units/)
reset();stored.books[0].balances[0].pending='1';await assert.rejects(checker,/conservation/)
reset();stored=undefined;await assert.rejects(checker,/unavailable/)
reset();chainId=1;await assert.rejects(checker,/Base/)
console.log('PASS backing: finalized Base USDC balance versus all outstanding ledger obligations, shortage, unresolved sends, wallet revision, ledger/chain races, corrupt amounts and missing-store fail closed. No spending authorization or live solvency claim.')
reset();stored.books.push(structuredClone(book));assert.equal((await checker()).obligationUnits,'18000000');assert.equal((await checker()).backed,false);balance=18000000n;assert.equal((await checker()).backed,true)
reset();delete stored.books[0].fundingEvidence;assert.ok((await checker()).blockers.includes('unfunded_book_has_balances'))
console.log('PASS pooled obligations aggregate across books and unfunded nonzero books cannot disappear from backing checks.')
