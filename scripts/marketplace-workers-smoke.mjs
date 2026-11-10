import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {entryPoint06Address} from 'viem/account-abstraction'
import {requireMarketplaceGasCoverage} from '../api/marketplace/gas-coverage.ts'
import {drainMarketplaceWebhooks,marketplaceOperationalSnapshot} from '../api/marketplace/workers.ts'
const holding='0x'+'1'.repeat(40),paymaster='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64)
const abi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
const log={address:entryPoint06Address,topics:encodeEventTopics({abi,eventName:'UserOperationEvent',args:{userOpHash:hash,sender:holding,paymaster}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[0n,true,1n,1n])}
const policy={id:'coverage_a',holdingId:'holding_a',holdingRevision:'revision_a',walletId:'wallet_a',holdingAddress:holding,paymaster,projectIds:['project_a'],maximumFeeUnits:'10000',providerPolicyConfirmed:true,approvedBy:'operator_a',verifiedAt:1000,expiresAt:20000,proofTransactionHash:hash}
const settings={holdingId:'holding_a',holdingRevision:'revision_a',config:{walletId:'wallet_a',treasuryAddress:holding}}
const chain={getChainId:async()=>8453,getTransactionReceipt:async()=>({status:'success',blockNumber:1n,blockHash,logs:[log]}),getBlock:async()=>({number:2n,hash:blockHash})}
assert.equal((await requireMarketplaceGasCoverage(settings,'project_a','100',chain,async()=>policy,2000)).id,'coverage_a')
for(const patch of [{expiresAt:6000},{walletId:'other'},{projectIds:['other']},{providerPolicyConfirmed:false},{maximumFeeUnits:'99'},{approvedBy:''}])await assert.rejects(()=>requireMarketplaceGasCoverage(settings,'project_a','100',chain,async()=>({...policy,...patch}),2000))
await assert.rejects(()=>requireMarketplaceGasCoverage(settings,'project_a','100',{...chain,getTransactionReceipt:async()=>({status:'success',blockNumber:1n,blockHash,logs:[{...log,address:holding}]})},async()=>policy,2000),/does not match/)
const event=(id,createdAt)=>({id,type:'marketplace.payout.settled',projectId:'project_a',paymentId:'payment_a',operationId:'operation_a',asset:'USDC',currency:'USDC',network:'base',debitUnits:'100',recipientAmountUnits:'90',createdAt,delivery:'pending'})
let state={books:[{plan:{projectId:'project_a',paymentId:'payment_a'},operations:[{status:'unknown'}],walletEvents:[event('historical',1),event('current',100)]}],drafts:[]},calls=[]
const storage={read:async()=>structuredClone(state),mutate:async fn=>{state=fn(structuredClone(state));return structuredClone(state)},now:()=>200}
const deps={storage,notify:async(_p,_t,_d,e)=>{calls.push(e.eventId);return {status:'sent',eventId:e.eventId,responseStatus:200}}}
await drainMarketplaceWebhooks(['project_a'],50,deps);assert.deepEqual(calls,['current']);await drainMarketplaceWebhooks(['project_a'],50,deps);assert.equal(calls.length,1)
assert.equal(marketplaceOperationalSnapshot(state).unknownOperations,1)
state.books[0].walletEvents[0].replayApprovedAt=200;await drainMarketplaceWebhooks(['project_a'],50,deps);assert.deepEqual(calls,['current','historical'])
console.log('PASS current gas coverage policy, finalized canonical EntryPoint proof, spoof/expiry/tenant rejection, independent webhook drain, historical cutoff, explicit replay and operational counters.')
