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

export {client,reset,release,binding,buyer,seller,escrow,usdc};
