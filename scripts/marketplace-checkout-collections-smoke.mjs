import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {createMarketplaceCollectionRuntime} from '../api/marketplace/runtime.ts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'
const holding='0x'+'22'.repeat(20),payer='0x'+'11'.repeat(20),bills='0x'+'33'.repeat(20),tx='0x'+'aa'.repeat(32),block='0x'+'bb'.repeat(32)
const env={MARKETPLACE_COLLECTIONS_ENABLED:'true',MARKETPLACE_ENVIRONMENT:'base-mainnet',MARKETPLACE_CIRCLE_API_KEY:'fixture_secret_key',MARKETPLACE_CIRCLE_ENTITY_SECRET:'ab'.repeat(32),MARKETPLACE_HOLDING_WALLET_SET_ID:'11111111-1111-4111-8111-111111111111',MARKETPLACE_HOLDING_WALLET_ID:'22222222-2222-4222-8222-222222222222',MARKETPLACE_HOLDING_ADDRESS:holding,MARKETPLACE_HOLDING_ID:'holding_a',MARKETPLACE_HOLDING_REVISION:'revision_a',MARKETPLACE_PROJECT_IDS:'project_a,project_b',POCKET_BILLS_TREASURY_WALLET_ID:'33333333-3333-4333-8333-333333333333',POCKET_BILLS_TREASURY_ADDRESS:bills}
const original={id:'chk_12345678',partnerId:'project_a',kind:'usdc_request',feePayer:'payer',flexible:false,environment:'live',network:'base',asset:'USDC',recipient:holding,amount:'10',createdAt:new Date(1000).toISOString(),expiresAt:new Date(60000).toISOString(),integrity:'ab'.repeat(32)}
const payment={status:'paid',referenceType:'evm_tx_hash',txHash:tx,payer,amount:'10',network:'base',confirmedAt:new Date(20000).toISOString()}
let stored,record,now,queue=Promise.resolve(),walletReads=0,holdingFails=false,reads=0,changeOnSecond=false
const storage={read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored||{books:[],drafts:[]}));return structuredClone(stored)});queue=job.catch(()=>{});return job},now:()=>now}
const abi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
const chain={getChainId:async()=>8453,getBlock:async input=>({number:100n,hash:block,timestamp:20n}),getTransactionReceipt:async()=>({transactionHash:tx,status:'success',blockNumber:100n,blockHash:block,logs:[{address:BASE_STABLECOINS.USDC.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:payer,to:holding}}),data:encodeAbiParameters([{type:'uint256'}],[10000000n]),logIndex:0,blockNumber:100n,blockHash:block,transactionHash:tx,removed:false},{address:BASE_STABLECOINS.USDC.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:payer,to:EVM_PLATFORM_TREASURY}}),data:encodeAbiParameters([{type:'uint256'}],[30000n]),logIndex:1,blockNumber:100n,blockHash:block,transactionHash:tx,removed:false}]})}
const payerFees={quoteId:'quote_fixture',treasuryAddress:EVM_PLATFORM_TREASURY,platformFeeUnits:'25000',networkFeeUnits:'5000',treasuryUnits:'30000',totalUnits:'10030000'}
const deps={env,chain,storage,verifyPayerFees:async()=>({amount:'10',payerFees}),readCheckout:async()=>{reads++;return changeOnSecond&&reads>1?{...record,payment}:structuredClone(record)},circle:{verifyConfiguredWallet:async()=>{walletReads++;if(holdingFails)throw Error('Holding mismatch');return {}}}}
const runtime=createMarketplaceCollectionRuntime(deps),repo=createMarketplaceRepository(storage)
await repo.create({projectId:'project_a',paymentId:'payment_a',network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_a',sellerId:'seller_a',role:'seller',amount:'10',settlement:'wallet_usdc',beneficiaryId:'wallet_a'}]},'draft_a')
const empty=structuredClone(stored)
function reset(){stored=structuredClone(empty);record=structuredClone(original);now=10000;walletReads=0;holdingFails=false;reads=0;changeOnSecond=false}
for(const patch of [{MARKETPLACE_COLLECTIONS_ENABLED:'false'},{MARKETPLACE_CIRCLE_API_KEY:''},{MARKETPLACE_HOLDING_WALLET_ID:env.POCKET_BILLS_TREASURY_WALLET_ID},{MARKETPLACE_HOLDING_ADDRESS:bills},{MARKETPLACE_PROJECT_IDS:''}])assert.throws(()=>createMarketplaceCollectionRuntime({...deps,env:{...env,...patch}}),/not ready/)
for(const change of [()=>record=null,()=>record.id='chk_wrong000',()=>record.partnerId='other',()=>record.kind='service',()=>record.flexible=true,()=>record.environment='test',()=>record.network='arbitrum',()=>record.asset='USDT',()=>record.recipient=bills,()=>record.amount='9',()=>record.settlement={mode:'ngn'},()=>record.providerFunding={},()=>record.cashPayer={},()=>record.feePayer='merchant',()=>delete record.feePayer,()=>record.checkoutMode='agentic',()=>record.paymentOptions=[{network:'base',recipient:holding},{network:'arbitrum',recipient:holding}],()=>record.integrity='bad',()=>record.payment=payment,()=>record.paymentAttempts=[{status:'processing'}],()=>now=60000,()=>holdingFails=true,()=>changeOnSecond=true]){reset();change();await assert.rejects(()=>runtime.bindCheckout('project_a','payment_a','chk_12345678'));assert.deepEqual(stored,empty)}
reset();await assert.rejects(()=>runtime.bindCheckout('other','payment_a','chk_12345678'),/not enabled/);assert.equal(walletReads,0)
reset();await Promise.all([runtime.bindCheckout('project_a','payment_a','chk_12345678'),runtime.bindCheckout('project_a','payment_a','chk_12345678')]);assert.ok(stored.books[0].collectionCheckout)
await assert.rejects(()=>repo.execute('project_a','payment_a','manual',{type:'fund',network:'base',asset:'USDC',amountUnits:'10000000',evidenceId:'fake_proof'}),/collection verifier/)
await assert.rejects(()=>runtime.verifyCollection('project_a','payment_a'),/unavailable/)
const bound=structuredClone(stored)
for(const patch of [{network:'arbitrum'},{referenceType:'circle_gateway_transfer'},{status:'processing'},{amount:'9'},{confirmedAt:new Date(9000).toISOString()},{confirmedAt:new Date(61000).toISOString()},{fees:{}}]){stored=structuredClone(bound);record={...original,payment:{...payment,...patch}};await assert.rejects(()=>runtime.verifyCollection('project_a','payment_a'));assert.equal(stored.books[0].fundingEvidence,undefined)}
stored=structuredClone(bound);record={...original,payment};now=90000
const proof=await runtime.verifyCollection('project_a','payment_a');assert.equal(proof.session.sessionId,original.id);assert.equal(proof.session.payerId,'wallet:base:'+payer)
assert.equal(stored.books[0].balances[0].pending,'10000000');assert.ok(walletReads>0)
const refund=await runtime.resolveRefundCollection({projectId:'project_a',paymentId:'payment_a',fundingEvidenceId:proof.evidenceId});assert.equal(refund.payerWallet,payer)
await runtime.verifyCollection('project_a','payment_a');assert.equal(stored.books[0].journal.length,1)
record={...record,integrity:'cd'.repeat(32)};await assert.rejects(()=>runtime.verifyCollection('project_a','payment_a'),/binding changed/)
console.log('PASS hosted marketplace collection: pre-payment binding, closed rollout/config gates, holding verification, checkout route isolation, amount/identity/lifetime checks, concurrent bind, no generic funding, finalized pending credit, late reconciliation and original wallet refund binding. Mock providers only.')
reset();await repo.create({projectId:'project_a',paymentId:'payment_b',network:'base',asset:'USDC',amount:'10',allocations:[{id:'share_b',sellerId:'seller_b',role:'seller',amount:'10',settlement:'wallet_usdc',beneficiaryId:'wallet_b'}]},'draft_b')
const conflict=await Promise.allSettled([runtime.bindCheckout('project_a','payment_a','chk_12345678'),runtime.bindCheckout('project_a','payment_b','chk_12345678')]);assert.equal(conflict.filter(r=>r.status==='fulfilled').length,1);assert.equal(stored.books.filter(b=>b.collectionCheckout).length,1)
await assert.rejects(()=>runtime.resolveRefundCollection({projectId:'not_allowed',paymentId:'payment_a',fundingEvidenceId:'proof'}),/not enabled/)
console.log('PASS one checkout cannot bind two orders concurrently; refund lookup respects rollout scope.')

// Treasury fees are required in the same finalized receipt, but never credited to sellers.
for(const mode of ['missing','wrong_amount','duplicate','removed']){
 reset();await runtime.bindCheckout('project_a','payment_a','chk_12345678');record={...original,payment}
 const changedChain={...chain,getTransactionReceipt:async()=>{const receipt=await chain.getTransactionReceipt();if(mode==='missing')receipt.logs.pop();if(mode==='wrong_amount')receipt.logs[1].data=encodeAbiParameters([{type:'uint256'}],[29999n]);if(mode==='duplicate')receipt.logs.push({...receipt.logs[1],logIndex:2});if(mode==='removed')receipt.logs[1].removed=true;return receipt}}
 await assert.rejects(()=>createMarketplaceCollectionRuntime({...deps,chain:changedChain}).verifyCollection('project_a','payment_a'))
 assert.equal(stored.books[0].fundingEvidence,undefined)
}
console.log('PASS payer fees: full order reaches holding, treasury fees verified separately, missing/short/duplicate/removed fee logs never credit allocations.')
