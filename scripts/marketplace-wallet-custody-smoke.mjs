import assert from 'node:assert/strict'
import {privateKeyToAccount} from 'viem/accounts'
import {createMarketplaceRepository} from '../api/marketplace/repository.ts'
import {walletTransferHash} from '../api/marketplace/wallet-execution.ts'
const wallet=privateKeyToAccount('0x'+'44'.repeat(32))
let stored,queue=Promise.resolve(),now=1000000,preflight
const deps={now:()=>now,preflightWalletExecution:transfer=>preflight(transfer),read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{const next=fn(structuredClone(stored||{books:[],drafts:[]}));stored=next;return structuredClone(next)});queue=job.catch(()=>{});return job}}
let repo=createMarketplaceRepository(deps)
const good=transfer=>({holdingId:'holding_one',holdingRevision:'revision_one',sender:'0x'+'22'.repeat(20),feePolicyId:'fee_policy_one',transferHash:walletTransferHash(transfer),expiresAt:now+60000,holdingApproved:true,authorizationActive:true,feesCoveredOutsideAllocation:true,additionalTokenDebitUnits:'0'})
async function reserved(asset,id){
 const beneficiaryId='wallet_'+id,paymentId='payment_'+id,operationId='operation_'+id
 const challenge=await repo.beginWalletVerification({projectId:'project_a',sellerId:'seller_a',beneficiaryId,asset,address:wallet.address})
 await repo.verifyWallet('project_a',beneficiaryId,challenge.nonce,await wallet.signMessage({message:challenge.message}))
 await repo.createWithVerifiedWallets({projectId:'project_a',paymentId,network:'base',asset,amount:'1.5',allocations:[{id:'share_a',sellerId:'seller_a',beneficiaryId,role:'seller',amount:'1.5',settlement:asset==='USDC'?'wallet_usdc':'wallet_usdt'}]},'draft_'+id)
 await repo.execute('project_a',paymentId,'fund_'+id,{type:'fund',evidenceId:'fixture:'+id,network:'base',asset,amountUnits:'1500000'})
 await repo.execute('project_a',paymentId,'release_'+id,{type:'release',allocationId:'share_a',amountUnits:'1500000'})
 await repo.walletPayouts.reserve('project_a',paymentId,'reserve_'+id,{operationId,allocationId:'share_a',amount:'1.5'},{credentialId:'credential_a',businessReference:'delivery_one'})
 return ['project_a',paymentId,operationId]
}

const {createMarketplaceWalletCustody}=await import('../api/marketplace/wallet-custody.ts')
const {BASE_STABLECOINS}=await import('../src/lib/baseStablecoins.ts')
const {parseAbi,encodeEventTopics,encodeAbiParameters}=await import('viem')
const refs=await reserved('USDC','custody')
const holding='0x'+'22'.repeat(20),bills='0x'+'33'.repeat(20),hash='0x'+'aa'.repeat(32),blockHash='0x'+'bb'.repeat(32)
const book=stored.books[0]
book.collectionProof={evidenceId:book.fundingEvidence}
book.refundCollection={projectId:refs[0],paymentId:refs[1],asset:'USDC',network:'base',fundingEvidenceId:book.fundingEvidence,holdingId:'holding_one',holdingRevision:'revision_one',holdingAddress:holding}
const original=structuredClone(stored)
let sends=0,timeout=false,allowed=true,backed=true,fees=true,finalized=99n,providerState='COMPLETE',receiptStatus='success',badRecipient=false,extraOutflow=false,removed=false,canonicalHash=blockHash,wrongChain=false,transaction,providerPatch={}
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
const log=()=>({address:BASE_STABLECOINS.USDC.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:holding,to:badRecipient?bills:wallet.address}}),data:encodeAbiParameters([{type:'uint256'}],[1500000n]),logIndex:0,transactionHash:hash,blockHash,blockNumber:100n,transactionIndex:0,removed})
const config={verificationReady:true,blockchain:'BASE',accountType:'SCA',treasuryAddress:holding,walletId:'holding-wallet'}
const circle={verifyConfiguredWallet:async()=>({}),createUsdcTransfer:async input=>{
 sends++;assert.equal(input.amount,'1.5');assert.equal(stored.books[0].operations[0].status,'unknown');assert.ok(stored.books[0].walletExecutions[0].circleTransfer)
 transaction={id:'provider_transaction',walletId:config.walletId,refId:input.refId,blockchain:'BASE',transactionType:'OUTBOUND',sourceAddress:holding,destinationAddress:wallet.address,amounts:['1.500000'],txHash:hash,state:providerState}
 if(timeout)throw Error('timeout after provider acceptance')
 return {id:transaction.id}
},getTransaction:async()=>({...transaction,state:providerState,...providerPatch}),findTransferByReference:async()=>transaction?({...transaction,state:providerState,...providerPatch}):null}
const chain={getChainId:async()=>wrongChain?1:8453,getBlock:async input=>({number:input.blockTag?finalized:100n,hash:canonicalHash}),getTransactionReceipt:async()=>({transactionHash:hash,status:receiptStatus,blockNumber:100n,blockHash,logs:receiptStatus==='reverted'?[]:extraOutflow?[log(),{...log(),logIndex:1}]:[log()]})}
const input={...deps,now:()=>++now,enabled:true,config,holdingId:'holding_one',holdingRevision:'revision_one',billsAddress:bills,projectIds:['project_a'],circle,chain,authorize:async()=>allowed,verifyBacking:async()=>({backed}),verifyFees:async()=>({feePolicyId:'fees_one',expiresAt:now+60000,feesCoveredOutsideAllocation:fees,additionalTokenDebitUnits:'0'})}
for(const patch of [{enabled:false},{billsAddress:holding},{projectIds:[]}]){
 stored=structuredClone(original);await assert.rejects(()=>createMarketplaceWalletCustody({...input,...patch}).submit(...refs,'worker_a'))
}
for(const blocker of ['authority','backing','fees']){
 stored=structuredClone(original);allowed=blocker!=='authority';backed=blocker!=='backing';fees=blocker!=='fees'
 await assert.rejects(()=>createMarketplaceWalletCustody(input).submit(...refs,'worker_a'))
 assert.equal(sends,0)
}
allowed=true;backed=true;fees=true;stored=structuredClone(original);timeout=true
let custody=createMarketplaceWalletCustody(input)
const race=await Promise.allSettled([custody.submit(...refs,'worker_a'),custody.submit(...refs,'worker_b')])
assert.equal(sends,1);assert.ok(race.some(r=>r.status==='rejected'))
custody=createMarketplaceWalletCustody(input);allowed=false
await custody.submit(...refs,'worker_restart');assert.equal(sends,1,'revoked authority does not block read-only recovery or permit resending')
assert.equal(stored.books[0].balances[0].reserved,'1500000')
assert.equal((await custody.reconcile(...refs)).status,'unknown')
finalized=100n;canonicalHash='0x'+'cc'.repeat(32);assert.equal((await custody.reconcile(...refs)).status,'unknown');canonicalHash=blockHash
for(const mode of ['recipient','extra','removed','chain']){
 badRecipient=mode==='recipient';extraOutflow=mode==='extra';removed=mode==='removed';wrongChain=mode==='chain'
 await assert.rejects(()=>custody.reconcile(...refs));assert.equal(stored.books[0].balances[0].paid,'0')
}
badRecipient=false;extraOutflow=false;removed=false;wrongChain=false
providerPatch={id:'another_transaction'};await assert.rejects(()=>custody.recover(...refs));providerPatch={destinationAddress:bills};await assert.rejects(()=>custody.recover(...refs));providerPatch={}
const results=await Promise.all([custody.reconcile(...refs),custody.reconcile(...refs)])
assert.equal(stored.books[0].balances[0].paid,'1500000');assert.equal(stored.books[0].walletEvents.length,1)
now+=1000;assert.equal((await custody.reconcile(...refs)).status,'settled');assert.equal(sends,1)
// A finalized revert releases the reservation only after the provider is terminal.
stored=structuredClone(original);allowed=true;timeout=false;receiptStatus='reverted';providerState='PENDING';transaction=undefined
custody=createMarketplaceWalletCustody(input);await custody.submit(...refs,'worker_failure')
assert.equal((await custody.reconcile(...refs)).status,'unknown')
providerState='FAILED';assert.equal((await custody.reconcile(...refs)).status,'failed')
assert.equal(stored.books[0].balances[0].available,'1500000');assert.equal(stored.books[0].balances[0].reserved,'0')
// Missing lookup results retain ambiguity forever; retries never generate another transfer.
stored=structuredClone(original);timeout=true;providerState='COMPLETE';receiptStatus='success';transaction=undefined
custody=createMarketplaceWalletCustody(input);await assert.rejects(()=>custody.submit(...refs,'worker_timeout'))
const sent=sends;transaction=undefined;await custody.submit(...refs,'worker_retry');assert.equal(sends,sent);assert.equal(stored.books[0].balances[0].reserved,'1500000')
console.log('PASS Circle wallet custody: fail-closed gates, exact formatted USDC, durable pre-send binding, concurrent submission, timeout recovery, no blind resend, finalized exact payout, reorg/wrong-chain/extra-outflow rejection, terminal failure restoration and idempotent webhooks. Fixtures only; no funds moved.')
