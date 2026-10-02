import assert from 'node:assert/strict'
import {decodeFunctionData,keccak256,zeroAddress} from 'viem'
import {bindArcTradeTerms,parseArcTradeCheckout,ARC_TRADE_POLICY} from '../api/trade-agreement/arc.ts'
import {planArcTradeCandidate,prepareArcTradeAction} from '../api/trade-agreement/arc-planner.ts'
import {verifyArcTradeAuthority,verifyArcTradeFactory,ARC_TRADE_FACTORY_ABI,MODULE_SENTINEL} from '../api/trade-agreement/arc-verification.ts'
import {TRADE_TOKEN_ABI,TRADE_ESCROW_ABI} from '../src/lib/xstocksAgreement/protocol.ts'
const addr=n=>'0x'+n.repeat(40),buyer=addr('1'),seller=addr('2'),factory=addr('3'),arbiter=addr('4'),singleton=addr('5'),escrow=addr('6'),usdc='0x3600000000000000000000000000000000000000'
const code={factory:'0x6000',proxy:'0x6001',singleton:'0x6002'}
const release={policy:ARC_TRADE_POLICY,chainId:5042,factory,arbiter,factoryRuntimeHash:keccak256(code.factory),authority:{proxyRuntimeHash:keccak256(code.proxy),singleton,singletonRuntimeHash:keccak256(code.singleton),owners:[addr('7'),addr('8')],threshold:2,version:'1.4.1'}}
const terms=parseArcTradeCheckout({kind:'trade',paymentRail:'arc',chainId:5042,paymentToken:usdc,title:'Fixture',description:'Synthetic only',amount:'1.25',trade:{offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'1.00',deliveryFee:'0.25',handover:'Delivery',location:'Test location',carrier:'Test carrier',returns:'Return if materially different.',dispatchDays:1,deliveryDays:2,inspectionHours:24}})
const binding=bindArcTradeTerms('tag_'+'a'.repeat(64),terms,buyer,seller,100,release),t=binding.contractTerms
let change,simulations,reads,blocks
function reset(patch={}){change={state:1,escrow,chain:5042,now:1000n,allowance:0n,threshold:2n,owners:release.authority.owners,modules:[[],MODULE_SENTINEL],...patch};simulations=[];reads=[];blocks=0}
reset()
const client={
 async getChainId(){return change.chain},
 async getBlockNumber(){return change.head??100n},
 async getBlock(){blocks++;return {hash:change.reorg&&blocks>1?'0x'+'bb'.repeat(32):'0x'+'aa'.repeat(32),timestamp:change.now}},
 async getCode({address}){return address.toLowerCase()===factory?change.factoryCode??code.factory:address.toLowerCase()===arbiter?change.proxyCode??code.proxy:code.singleton},
 async readContract(i){
  reads.push(i);const target=i.address.toLowerCase(),latest=i.blockNumber===undefined
  if(target===factory){
   if(i.functionName==='token')return change.token??usdc
   if(i.functionName==='arbiter')return change.arbiter??arbiter
   if(i.functionName==='escrows')return latest?(change.latestEscrow??change.escrow):change.escrow
  }
  if(target===arbiter){
   const values={masterCopy:change.singleton??singleton,VERSION:'1.4.1',getOwners:change.owners,getThreshold:latest?(change.latestThreshold??change.threshold):change.threshold,getModulesPaginated:change.modules}
   if(i.functionName in values)return values[i.functionName]
  }
  if(target===usdc.toLowerCase()){
   if(i.functionName==='decimals')return change.decimals??6
   if(i.functionName==='allowance')return latest?(change.latestAllowance??change.allowance):change.allowance
  }
  if(target===escrow){
   if(i.functionName==='state')return latest?(change.latestState??change.state):change.state
   const values={...t,...change.terms,dispatchBy:2000n,deliveryBy:3000n,inspectUntil:4000n,settlementNonce:latest?(change.latestNonce??2n):2n,proposedBuyerAmount:625000n,settlementEvidence:'0x'+'cc'.repeat(32),settlementProposer:change.proposer??seller}
   if(i.functionName in values)return values[i.functionName]
  }
  throw Error('Unexpected read '+i.functionName)
 },
 async call(tx){if(change.simulationFail)throw Error('Simulation reverted');simulations.push(tx)}
}
const plan=(patch={})=>planArcTradeCandidate({binding,account:buyer,fundingEnabled:true,...patch},client,release)
let result=await plan({action:'approve'})
assert.equal(result.transaction.chainId,5042);assert.equal(result.transaction.value,'0')
assert.deepEqual(decodeFunctionData({abi:TRADE_TOKEN_ABI,data:result.transaction.data}).args,[escrow,1250000n])
reset({allowance:1n,latestAllowance:1n});result=await plan({action:'approve'});assert.equal(decodeFunctionData({abi:TRADE_TOKEN_ABI,data:result.transaction.data}).args[1],0n)
reset({allowance:1250000n});result=await plan({action:'fund'});assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:result.transaction.data}).functionName,'fund')
reset({escrow:zeroAddress});result=await plan({account:seller,action:'create'});assert.equal(result.transaction.to,factory);assert.equal(decodeFunctionData({abi:ARC_TRADE_FACTORY_ABI,data:result.transaction.data}).functionName,'create')
reset({escrow:zeroAddress,now:BigInt(t.fundBy)});assert.equal((await plan({account:seller})).fundingExpired,true);await assert.rejects(()=>plan({account:seller,action:'create'}))
for(const patch of [{chain:196},{chain:5042002},{factoryCode:'0x'},{factoryCode:'0x1234'},{token:addr('9')},{arbiter:addr('9')},{decimals:18},{terms:{amount:'1'}},{state:10},{head:5n},{reorg:true}]){reset(patch);await assert.rejects(()=>plan());assert.equal(simulations.length,0)}
reset();await assert.rejects(()=>plan({account:addr('9')}))
for(const patch of [{chainId:196},{policy:'trade-xlayer-v1'},{custody:'xstocks-shares-v2'},{contractTerms:{...t,decimals:18}},{contractTerms:{...t,buyer:seller}},{contractTerms:{...t,amount:'0'}}]){reset();await assert.rejects(()=>plan({binding:{...binding,...patch}}));assert.equal(simulations.length,0)}
for(const patch of [{threshold:1n},{threshold:3n},{owners:[addr('7'),addr('9')]},{modules:[[addr('9')],MODULE_SENTINEL]},{modules:[[],zeroAddress]},{proxyCode:'0x'},{singleton:addr('9')},{latestThreshold:1n}]){
 reset(patch);result=await plan();assert.deepEqual(result.actions,['cancel']);assert.equal(result.enabled,false);await assert.rejects(()=>plan({action:'approve'}));assert.equal(simulations.length,0)
}
reset();result=await plan({fundingEnabled:false});assert.deepEqual(result.actions,['cancel'])
reset({state:2,threshold:1n});result=await plan({account:seller,fundingEnabled:false,action:'refund',evidence:'Refund this fixture payment'});assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:result.transaction.data}).functionName,'refundBySeller')
reset({state:4,now:4000n});assert.ok((await plan({account:seller})).actions.includes('inspectionRelease'));assert.ok(!(await plan()).actions.includes('dispute'))
reset({state:5});result=await plan();assert.ok(result.actions.includes('acceptSettlement'));assert.ok(!result.actions.includes('release'));assert.ok(!result.actions.includes('inspectionRelease'))
const proposal={nonce:'2',buyerAmount:'625000',evidence:'0x'+'cc'.repeat(32)}
result=await plan({action:'acceptSettlement',settlement:proposal});assert.deepEqual(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:result.transaction.data}).args,[2n,625000n,proposal.evidence])
for(const patch of [{nonce:'1'},{buyerAmount:'1'},{evidence:'0x'+'dd'.repeat(32)}])await assert.rejects(()=>plan({action:'acceptSettlement',settlement:{...proposal,...patch}}))
result=await plan({action:'proposeSettlement',settlement:{nonce:'2',buyerAmount:'0'},evidence:'Return the remaining amount'});assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:result.transaction.data}).args[0],0n)
await assert.rejects(()=>plan({action:'proposeSettlement',settlement:{nonce:'2',buyerAmount:'1250001'},evidence:'Invalid excess allocation'}))
await assert.rejects(()=>plan({action:'resolveDispute'}))
for(const patch of [{latestState:2},{latestEscrow:zeroAddress},{state:5,latestNonce:3n}]){reset(patch);result=await plan();assert.equal(result.pending,true);assert.deepEqual(result.actions,[]);assert.equal(result.transaction,undefined)}
reset({simulationFail:true});await assert.rejects(()=>plan({action:'approve'}),/Simulation reverted/)
reset();assert.equal((await prepareArcTradeAction({binding,account:buyer,env:{},projectId:'dev_1234567890'})).enabled,false)
await assert.rejects(()=>prepareArcTradeAction({binding,account:buyer,action:'fund',env:{HASHPAYLINK_TRADE_ARC_ENABLED:'true'},projectId:'dev_1234567890'}),/pending verification/)
await verifyArcTradeFactory(client,release,95n);await verifyArcTradeAuthority(client,release,95n)
console.log('Arc planner passed: verified factory/USDC/Safe policy, exact approvals, confirmed-state checks, chain/role/term rejection, pause-safe recovery, exact split proposals, no reviewer bypass, simulation and inactive production gate.')
for(const [state,actor,action,name,now] of [
 [0,seller,'accept','acceptTerms',1000n],[0,buyer,'cancel','cancelUnfunded',1000n],
 [2,seller,'dispatch','markDispatched',1000n],[2,buyer,'missedDispatch','refundUndispatched',2000n],
 [3,buyer,'receipt','confirmReceipt',1000n],[3,buyer,'release','approveRelease',1000n],
 [3,buyer,'dispute','openDispute',1000n],[3,seller,'refund','refundBySeller',1000n],
 [4,seller,'inspectionRelease','releaseAfterInspection',4000n],
]) {
 reset({state,now});const planned=await plan({account:actor,action,evidence:'Synthetic delivery reference'})
 assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:planned.transaction.data}).functionName,name)
 assert.equal(planned.transaction.account,actor);assert.equal(planned.transaction.to,escrow)
}
reset({state:5});result=await plan({account:seller,action:'withdrawSettlement',settlement:proposal})
assert.equal(decodeFunctionData({abi:TRADE_ESCROW_ABI,data:result.transaction.data}).functionName,'withdrawSettlement')
reset({state:2});await assert.rejects(()=>plan({account:seller,action:'dispatch',evidence:'short'}));assert.equal(simulations.length,0)
reset({reorg:true});await assert.rejects(()=>plan({action:'approve'}),/chain state changed/)
console.log('Every participant action encodes the expected contract method; evidence and post-simulation reorg checks passed.')

reset({chain:196});await assert.rejects(()=>verifyArcTradeAuthority(client,release,95n),/network mismatch/)
