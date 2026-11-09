import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceCollections} from '../api/marketplace/collections.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
const payer='0x'+'11'.repeat(20),holding='0x'+'22'.repeat(20),bills='0x'+'33'.repeat(20),tx='0x'+'aa'.repeat(32),block='0x'+'bb'.repeat(32)
const abi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
function transfer(from=payer,to=holding,value=10000000n){return {address:BASE_STABLECOINS.USDC.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value]),logIndex:0,blockNumber:100n,blockHash:block,transactionHash:tx,transactionIndex:0,removed:false}}
const baseSession={sessionId:'session_a',projectId:'project_a',paymentId:'payment_a',payerId:'buyer_a',payerWallet:payer,holdingId:'holding_a',holdingRevision:'revision_a',holdingAddress:holding,network:'base',asset:'USDC',amountUnits:'10000000',transactionHash:tx,issuedAt:50,expiresAt:150}
let stored,queue=Promise.resolve(),session,receipt,canonical,finalized,chainId,sessionReads,changed=false,failRpc=false
const storage={read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored||{books:[],drafts:[]}));return structuredClone(stored)});queue=job.catch(()=>{});return job},now:()=>200000}
const config={...storage,enabled:true,holding:{id:'holding_a',revision:'revision_a',address:holding,billsAddress:bills},resolveSession:async()=>{sessionReads++;return changed&&sessionReads>1?{...session,payerId:'changed'}:structuredClone(session)},chain:{getChainId:async()=>chainId,getTransactionReceipt:async()=>{if(failRpc)throw Error('RPC unavailable');return structuredClone(receipt)},getBlock:async input=>structuredClone(input.blockTag?finalized:canonical)}}
const repo=createMarketplaceRepository({...storage,collectionVerification:config})
const plan={projectId:'project_a',paymentId:'payment_a',network:'base',asset:'USDC',amount:'10',allocations:[{id:'seller_share',sellerId:'seller_a',role:'seller',amount:'9',settlement:'wallet_usdc',beneficiaryId:'wallet_a'},{id:'platform_fee',sellerId:'platform_a',role:'platform',amount:'1',settlement:'wallet_usdc',beneficiaryId:'wallet_b'}]}
await repo.create(plan,'draft_a');const empty=structuredClone(stored)
function reset(){stored=structuredClone(empty);session=structuredClone(baseSession);receipt={transactionHash:tx,status:'success',blockNumber:100n,blockHash:block,logs:[transfer()]};canonical={number:100n,hash:block,timestamp:100n};finalized={number:100n,hash:block};chainId=8453;sessionReads=0;changed=false;failRpc=false}
reset()
await assert.rejects(()=>repo.execute('project_a','payment_a','manual_fund',{type:'fund',evidenceId:'body_supplied',network:'base',asset:'USDC',amountUnits:'10000000'}),/collection verifier/)
await assert.rejects(()=>createMarketplaceCollections({...config,enabled:false}).verify('project_a','payment_a'),/disabled/)
assert.equal(sessionReads,0)
for(const change of [()=>session=null,()=>session.projectId='wrong_project',()=>session.paymentId='wrong_payment',()=>session.payerWallet=bills,()=>session.holdingAddress=bills,()=>session.holdingRevision='old_revision',()=>session.asset='USDT',()=>session.network='arbitrum',()=>session.amountUnits='9999999',()=>session.transactionHash='invalid',()=>session.issuedAt=101,()=>session.expiresAt=99,()=>session.issuedAt=NaN,()=>chainId=1,()=>receipt.status='reverted',()=>receipt.transactionHash='0x'+'cc'.repeat(32),()=>finalized.number=99n,()=>canonical.hash='0x'+'cc'.repeat(32),()=>canonical.number=99n,()=>receipt.logs=[],()=>receipt.logs=[transfer(bills)],()=>receipt.logs=[transfer(payer,bills)],()=>receipt.logs=[transfer(payer,holding,9999999n)],()=>receipt.logs=[transfer(payer,holding,10000001n)],()=>receipt.logs[0].address=BASE_STABLECOINS.USDT.address,()=>receipt.logs.push({...transfer(),logIndex:1}),()=>receipt.logs.push({...transfer(holding,payer,1n),logIndex:1}),()=>receipt.logs[0].removed=true,()=>receipt.logs[0].logIndex=null,()=>receipt.logs[0].blockHash='0x'+'cc'.repeat(32),()=>receipt.logs[0].transactionHash='0x'+'cc'.repeat(32),()=>changed=true,()=>failRpc=true]){reset();change();await assert.rejects(()=>repo.collections.verify('project_a','payment_a'));assert.deepEqual(stored,empty)}
reset();const races=await Promise.all([repo.collections.verify('project_a','payment_a'),repo.collections.verify('project_a','payment_a')]);assert.equal(races[0].evidenceId,races[1].evidenceId);assert.equal(stored.books[0].journal.length,1)
assert.deepEqual(stored.books[0].balances.map(b=>[b.pending,b.available]),[['9000000','0'],['1000000','0']])
assert.equal(stored.books[0].refundCollection.payerWallet,payer)
await repo.collections.verify('project_a','payment_a');assert.equal(stored.books[0].journal.length,1)
assert.equal(await repo.collections.resolveRefundCollection({projectId:'project_a',paymentId:'payment_a',fundingEvidenceId:'wrong'}),null)
await repo.refunds.reserve('project_a','payment_a','refund_key',{refundId:'refund_a',allocations:[{allocationId:'seller_share',amount:'1'}]},{credentialId:'credential_a',businessReference:'delivery_failed'})
assert.equal(stored.books[0].refundReservations[0].collection.payerWallet,payer)
// A matching transfer cannot be reused for a second app/payment, even with a new session.
await repo.create({...plan,projectId:'project_b',paymentId:'payment_b'},'draft_b')
session={...baseSession,sessionId:'session_b',projectId:'project_b',paymentId:'payment_b'};await assert.rejects(()=>repo.collections.verify('project_b','payment_b'),/already used/)
assert.equal(stored.books[1].fundingEvidence,undefined)
// Transaction identity alone cannot infer a payer: changing the trusted session conflicts.
session={...baseSession,payerId:'other_buyer'};await assert.rejects(()=>repo.collections.verify('project_a','payment_a'),/Conflicting/)
console.log('PASS collections: exact finalized Base USDC receipt, trusted payer/session/holding binding, invalid or ambiguous evidence rejection, disabled gates, atomic concurrent replay, cross-project reuse denial and original-payer refund binding. Synthetic fixtures; no live collection.')
reset();await repo.create({...plan,projectId:'project_b',paymentId:'payment_b'},'draft_b')
const cross=createMarketplaceCollections({...config,resolveSession:async({projectId,paymentId})=>({...baseSession,projectId,paymentId,sessionId:'session_'+projectId})})
const crossRace=await Promise.allSettled([cross.verify('project_a','payment_a'),cross.verify('project_b','payment_b')])
assert.equal(crossRace.filter(r=>r.status==='fulfilled').length,1);assert.equal(stored.books.filter(b=>b.fundingEvidence).length,1)
reset();await assert.rejects(()=>createMarketplaceCollections({...config,holding:{...config.holding,billsAddress:holding}}).verify('project_a','payment_a'),/isolated/)
reset();const mutating=createMarketplaceCollections({...config,resolveSession:async()=>{stored.books[0].plan.amountUnits='11000000';return baseSession}})
await assert.rejects(()=>mutating.verify('project_a','payment_a'),/changed/);assert.equal(stored.books[0].fundingEvidence,undefined)
reset();session.sessionId='s'.repeat(160);await repo.collections.verify('project_a','payment_a');assert.equal(stored.books[0].journal.length,1)
console.log('PASS cross-project collection race, holding isolation, concurrent plan edits and maximum-length session references.')
