import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {createMarketplaceRefundExecution} from '../api/marketplace/refund-execution.ts'
import {BASE_STABLECOINS} from '../src/lib/baseStablecoins.ts'

let stored,queue=Promise.resolve(),calls=0,timeout=false,finalized=99n,badLog=false
const holding='0x'+'22'.repeat(20),payer='0x'+'11'.repeat(20),bills='0x'+'33'.repeat(20)
const txHash='0x'+'aa'.repeat(32),blockHash='0x'+'bb'.repeat(32),transactionId='a68d5017-6cf1-4110-90ab-5693fa302341'
const config={verificationReady:true,blockchain:'BASE',accountType:'SCA',treasuryAddress:holding,walletId:'marketplace_wallet'}
const collection={projectId:'project_a',paymentId:'payment_a',fundingEvidenceId:'fixture:collection',route:'wallet',network:'base',asset:'USDC',tokenAddress:BASE_STABLECOINS.USDC.address,amountUnits:'10000000',payerId:'buyer_a',payerWallet:payer,holdingId:'holding_a',holdingRevision:'revision_a',holdingAddress:holding}
const store={read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored||{books:[],drafts:[]}));return structuredClone(stored)});queue=job.catch(()=>{});return job},now:()=>1000}
const repo=createMarketplaceRepository({...store,resolveRefundCollection:async()=>collection})
await repo.create({projectId:'project_a',paymentId:'payment_a',network:'base',asset:'USDC',amount:'10',allocations:[{id:'seller_a',sellerId:'seller_a',role:'seller',amount:'9',settlement:'wallet_usdc',beneficiaryId:'wallet_a'},{id:'fee_a',sellerId:'platform_a',role:'platform',amount:'1',settlement:'wallet_usdc',beneficiaryId:'wallet_fee'}]},'draft_a')
await repo.execute('project_a','payment_a','fund_a',{type:'fund',evidenceId:collection.fundingEvidenceId,network:'base',asset:'USDC',amountUnits:'10000000'})
await repo.execute('project_a','payment_a','release_a',{type:'release',allocationId:'seller_a',amountUnits:'8000000'})
const originalBalances=structuredClone(stored.books[0].balances)
await repo.refunds.reserve('project_a','payment_a','reserve_a',{refundId:'refund_a',allocations:[{allocationId:'seller_a',amount:'2'},{allocationId:'fee_a',amount:'0.5'}]},{credentialId:'credential_a',businessReference:'delivery_failed'})
const reservedSnapshot=structuredClone(stored)
let transaction,providerPatch={}
const circle={verifyConfiguredWallet:async()=>({}),createUsdcTransfer:async input=>{
 calls++;assert.equal(stored.books[0].refundExecutions[0].state,'unknown');assert.equal(input.amount,'2.5');assert.equal(input.destinationAddress,payer)
 transaction={id:transactionId,blockchain:'BASE',transactionType:'OUTBOUND',walletId:config.walletId,sourceAddress:holding,destinationAddress:payer,amounts:['2.500000'],refId:input.refId,txHash,state:'COMPLETE'}
 if(timeout)throw Error('provider timeout after acceptance')
 return {id:transactionId}
},getTransaction:async()=>({...transaction,...providerPatch})}
const abi=parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])
const chain={getChainId:async()=>8453,getBlock:async input=>({number:input.blockTag?finalized:100n,hash:blockHash}),getTransactionReceipt:async()=>({transactionHash:txHash,status:'success',blockNumber:100n,blockHash,logs:[{address:BASE_STABLECOINS.USDC.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:holding,to:badLog?bills:payer}}),data:encodeAbiParameters([{type:'uint256'}],[2500000n]),logIndex:0,blockNumber:100n,blockHash,transactionHash:txHash,transactionIndex:0,removed:false}]})}
const deps={...store,enabled:true,config,billsTreasuryAddress:bills,holdingId:'holding_a',holdingRevision:'revision_a',circle,chain,authorize:async()=>true}
const worker=createMarketplaceRefundExecution(deps),args=['project_a','payment_a','refund_a']
await assert.rejects(()=>createMarketplaceRefundExecution({...deps,enabled:false}).submit(...args),/disabled/)
await assert.rejects(()=>createMarketplaceRefundExecution({...deps,billsTreasuryAddress:holding}).submit(...args),/separate/)
await assert.rejects(()=>createMarketplaceRefundExecution({...deps,authorize:async()=>false}).submit(...args),/denied/)
assert.equal(calls,0)
timeout=true
const race=await Promise.allSettled([worker.submit(...args),worker.submit(...args)])
assert.equal(calls,1);assert.equal(race.filter(x=>x.status==='rejected').length,1)
assert.equal(stored.books[0].balances[0].reserved,'2000000')
await createMarketplaceRefundExecution(deps).submit(...args);assert.equal(calls,1,'restart does not blindly resubmit')
await assert.rejects(()=>worker.reconcile(...args),/recovery/)
providerPatch={destinationAddress:bills};await assert.rejects(()=>worker.attachTransaction(...args,transactionId),/does not match/)
providerPatch={};await worker.attachTransaction(...args,transactionId)
assert.equal((await worker.reconcile(...args)).state,'submitted','included receipt is not finalized')
finalized=100n;badLog=true;await assert.rejects(()=>worker.reconcile(...args),/exact/)
assert.equal(stored.books[0].balances[0].refunded,'0')
badLog=false
await Promise.all([worker.reconcile(...args),worker.reconcile(...args)])
assert.equal(stored.books[0].balances[0].refunded,'2000000');assert.equal(stored.books[0].balances[1].refunded,'500000')
assert.equal(stored.books[0].refundEvents.length,1)
assert.equal((await worker.submit(...args)).state,'settled');assert.equal(calls,1)
let payload
const notified=createMarketplaceRepository({...store,notifyMarketplace:async(project,type,data,options)=>{assert.equal(type,'marketplace.refund.settled');payload=data;return {status:'sent',eventId:options.eventId,responseStatus:200}}})
const [event]=await notified.webhooks.pending('project_a')
await notified.webhooks.deliver('project_a',event.paymentId,event.eventId)
assert.equal(payload.refundId,'refund_a');assert.equal(payload.recipientAmountUnits,'2500000');assert.equal(payload.payerWallet,undefined)
assert.equal(stored.books[0].refundEvents[0].delivery,'delivered')
stored=structuredClone(reservedSnapshot);timeout=false
assert.equal((await worker.submit(...args)).state,'submitted','successful provider response attaches automatically')
await worker.reconcile(...args)
assert.equal(stored.books[0].refundExecutions[0].state,'settled')
stored=structuredClone(reservedSnapshot)
let clock=0
await assert.rejects(()=>createMarketplaceRefundExecution({...deps,now:()=>clock,authorize:async()=>{clock=6000;return true}}).submit(...args),/expired/)
assert.equal(stored.books[0].refundExecutions,undefined)
// Definitive failure restores pending and available provenance, never marks the buyer paid.
await worker.submit(...args)
const submittedSnapshot=structuredClone(stored)
const revertedChain={...chain,getTransactionReceipt:async()=>({...await chain.getTransactionReceipt(),status:'reverted',logs:[]})}
const recovery=createMarketplaceRefundExecution({...deps,chain:revertedChain})
providerPatch={state:'SENT'}
assert.equal((await recovery.reconcile(...args)).state,'submitted')
assert.equal(stored.books[0].balances[0].reserved,'2000000')
providerPatch={state:'FAILED'};finalized=99n
assert.equal((await recovery.reconcile(...args)).state,'submitted')
finalized=100n
const reorg=createMarketplaceRefundExecution({...deps,chain:{...revertedChain,getBlock:async input=>({...await chain.getBlock(input),hash:input.blockTag?blockHash:'0x'+'cc'.repeat(32)})}})
assert.equal((await reorg.reconcile(...args)).state,'submitted')
providerPatch={state:'FAILED',txHash:'0x'+'dd'.repeat(32)}
await assert.rejects(()=>recovery.reconcile(...args),/hash changed/)
providerPatch={state:'FAILED'}
const rollback=createMarketplaceRefundExecution({...deps,chain:revertedChain,mutate:async fn=>{const next=fn(structuredClone(stored));if(next.books[0].refundEvents?.length)throw Error('database commit failed');stored=next;return structuredClone(next)}})
await assert.rejects(()=>rollback.reconcile(...args),/database commit failed/)
assert.equal(stored.books[0].refundEvents,undefined)
assert.equal(stored.books[0].balances[0].reserved,'2000000')
await Promise.all([recovery.reconcile(...args),recovery.reconcile(...args)])
assert.deepEqual(stored.books[0].balances,originalBalances)
assert.equal(stored.books[0].refundEvents.length,1)
assert.equal(stored.books[0].refundEvents[0].type,'marketplace.refund.failed')
assert.equal(stored.books[0].refundEvents[0].recipientAmountUnits,'0')
const failureCalls=calls
assert.equal((await recovery.submit(...args)).state,'failed')
assert.equal((await createMarketplaceRefundExecution({...deps,chain:revertedChain}).reconcile(...args)).state,'failed')
await recovery.attachTransaction(...args,transactionId)
assert.equal(stored.books[0].refundExecutions[0].state,'failed')
assert.equal(calls,failureCalls)
let failurePayload
const failureRepo=createMarketplaceRepository({...store,notifyMarketplace:async(project,type,data,options)=>{assert.equal(type,'marketplace.refund.failed');failurePayload=data;return {status:'sent',eventId:options.eventId,responseStatus:200}}})
const [failedEvent]=await failureRepo.webhooks.pending('project_a')
await failureRepo.webhooks.deliver('project_a',failedEvent.paymentId,failedEvent.eventId)
assert.equal(failurePayload.recipientAmountUnits,'0')
// Terminal provider labels without a chain hash cannot free reservations.
stored=structuredClone(submittedSnapshot);providerPatch={state:'FAILED',txHash:''}
assert.equal((await recovery.reconcile(...args)).state,'submitted')
assert.equal(stored.books[0].balances[0].reserved,'2000000')
providerPatch={};stored=structuredClone(reservedSnapshot)
stored.books[0].refundReservations[0].collection.asset='USDT'
await assert.rejects(()=>worker.submit(...args),/not configured/)
console.log('PASS marketplace Circle refund execution: gating, treasury isolation, authorization, concurrent submission, timeout/restart recovery, exact original-payer binding, finalized Base transfer, atomic split accounting, single event and webhook delivery. Synthetic provider/chain; no funds moved.')

console.log('PASS definitive refund failure: terminal provider plus canonical finalized revert, exact pending/available restoration, nonterminal/provisional/reorg/missing-hash rejection, immutable hash, commit rollback, concurrent idempotency, restart and failed webhook. Fixtures only.')
