import assert from 'node:assert/strict'
import {keccak256,decodeFunctionData,encodeFunctionResult,zeroAddress} from 'viem'
import {inspectArcTradeRelease,preflightArcTradeRelease} from '../api/trade-agreement/arc-preflight.ts'
import {ARC_TRADE_ENTRY_POINT,ARC_TRADE_ENTRY_POINT_V07,ARC_TRADE_WALLET_STATE_ABI} from '../api/trade-agreement/arc-execution.ts'
import {MODULE_SENTINEL} from '../api/trade-agreement/arc-verification.ts'
const addr=n=>'0x'+n.repeat(40),buyer=addr('1'),seller=addr('2'),factory=addr('3'),arbiter=addr('4'),singleton=addr('5'),implementation=addr('6'),usdc='0x3600000000000000000000000000000000000000'
const code={factory:'0x6000',safe:'0x6001',singleton:'0x6002',wallet:'0x6003',implementation:'0x6004',entry:'0x6005'}
const release={policy:'trade-arc-usdc-v1',chainId:5042,factory,arbiter,factoryRuntimeHash:keccak256(code.factory),authority:{proxyRuntimeHash:keccak256(code.safe),singleton,singletonRuntimeHash:keccak256(code.singleton),owners:[addr('7'),addr('8')],threshold:2,version:'1.4.1'}}
const executionPolicy={walletRuntimeHash:keccak256(code.wallet),entryPointRuntimeHash:keccak256(code.entry),walletImplementation:implementation,walletImplementationRuntimeHash:keccak256(code.implementation)}
let patch={},reads=[],blockReads=0,created=0
const reader=()=>{created++;return {
 getChainId:async()=>patch.chain??5042,getBlockNumber:async()=>100n,
 getBlock:async()=>({hash:'0x'+(patch.reorg&&++blockReads>2?'bb':'aa').repeat(32),timestamp:patch.stale?1n:1000n}),
 getCode:async({address,blockNumber})=>{reads.push(blockNumber);if(patch.code)return '0x';const a=address.toLowerCase();return a===factory?code.factory:a===arbiter?code.safe:a===singleton?code.singleton:a===implementation?code.implementation:a===ARC_TRADE_ENTRY_POINT.toLowerCase()?code.entry:code.wallet},
 getStorageAt:async()=> '0x'+'0'.repeat(24)+(patch.implementation??implementation).slice(2),
 readContract:async({address,functionName,blockNumber})=>{
  reads.push(blockNumber);const a=address.toLowerCase()
  if(a===factory)return functionName==='token'?usdc:arbiter
  if(a===usdc)return patch.decimals??6
  if(a===arbiter)return {masterCopy:singleton,VERSION:'1.4.1',getOwners:release.authority.owners,getThreshold:patch.threshold&&blockNumber===100n?1n:2n,getModulesPaginated:patch.modules?[[addr('9')],MODULE_SENTINEL]:[[],MODULE_SENTINEL]}[functionName]
  throw Error('unexpected contract')
 },
 call:async()=>{throw Error('Preflight must never simulate or send')},getTransaction:async()=>{throw Error('No transaction read expected')},getTransactionReceipt:async()=>{throw Error('No receipt read expected')},
}}
const run=()=>inspectArcTradeRelease({manifest:{release,executionPolicy},wallets:[buyer,seller],reader,now:1000000})
let result=await preflightArcTradeRelease([],()=>{throw Error('invalid wallets must avoid RPC')});assert.equal(result.checksPassed,false);assert.equal(result.productionReady,false);assert.equal(result.blockers.length,1)
result=await inspectArcTradeRelease({manifest:{release:null,executionPolicy:null},wallets:[],reader});assert.equal(result.blockers.length,3)
result=await run();assert.equal(result.checksPassed,true);assert.equal(result.productionReady,false);assert.equal(result.confirmedBlock,'95');assert.equal(result.headBlock,'100');assert.ok(reads.includes(95n)&&reads.includes(100n));assert.ok(reads.every(v=>v===95n||v===100n))
for(const change of [{chain:196},{chain:5042002},{code:true},{decimals:18},{threshold:true},{modules:true},{implementation:addr('9')},{stale:true},{reorg:true}]){patch=change;blockReads=0;result=await run();assert.equal(result.checksPassed,false,JSON.stringify(change));assert.equal(result.productionReady,false)}
patch={};for(const wallets of [[],[buyer,buyer],[factory,seller],['invalid',seller]]){const before=created;result=await inspectArcTradeRelease({manifest:{release,executionPolicy},wallets,reader,now:1000000});assert.equal(result.checksPassed,false);assert.equal(created,before)}
result=await inspectArcTradeRelease({manifest:{release,executionPolicy},wallets:[buyer,seller],reader:()=>{throw Error('https://secret:password@rpc.invalid/private-key')}});assert.equal(JSON.stringify(result).includes('password'),false)
patch={};const stateReads=[]
const v07reader=()=>{
 const r=reader(),getCode=r.getCode
 r.getCode=async i=>i.address===addr('9')?'0x':i.address.toLowerCase()===ARC_TRADE_ENTRY_POINT_V07.toLowerCase()?code.entry:getCode(i)
 r.call=async({to,data,blockNumber})=>{
  stateReads.push(blockNumber);const {functionName}=decodeFunctionData({abi:ARC_TRADE_WALLET_STATE_ABI,data})
  const ref={plugin:zeroAddress,functionId:0}
  const result={getEntryPoint:ARC_TRADE_ENTRY_POINT_V07,getNativeOwner:addr('9'),getInstalledPlugins:patch.walletPlugin?[addr('8')]:[],getExecutionHooks:[],getPreValidationHooks:[[],[]],getExecutionFunctionConfig:{plugin:to,userOpValidationFunction:ref,runtimeValidationFunction:ref}}[functionName]
  return {data:encodeFunctionResult({abi:ARC_TRADE_WALLET_STATE_ABI,functionName,result})}
 };return r
}
const runV07=()=>inspectArcTradeRelease({manifest:{release,executionPolicy:{...executionPolicy,entryPointVersion:'0.7'}},wallets:[buyer,seller],reader:v07reader,now:1000000})
assert.equal((await runV07()).checksPassed,true)
assert(stateReads.includes(95n)&&stateReads.includes(100n));assert(stateReads.every(n=>n===95n||n===100n))
patch={walletPlugin:true};assert.equal((await runV07()).checksPassed,false)
console.log('Arc release preflight passed: inactive source gate, both block snapshots, exact factory/Safe/wallet checks, stale/reorg rejection, sanitized failures and no production authorization.')
