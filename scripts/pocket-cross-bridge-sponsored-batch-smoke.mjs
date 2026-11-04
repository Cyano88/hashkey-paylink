import assert from 'node:assert/strict'
import {decodeAbiParameters,decodeFunctionData,parseAbi} from 'viem'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {encodePrivyValueBatch,estimatePrivyValueBatchGas,encodeXLayerSponsoredBatch,estimatePrivySponsoredBatchGas,XLAYER_ENTRY_POINT} from '../api/pocket/xlayer-sponsored-cost.ts'
const wallet='0x1111111111111111111111111111111111111111',treasury='0x3333333333333333333333333333333333333333',kernel='0xd6cedde84be40893d153be9d467cd6ad37875b28'
const abi=parseAbi(['function execute(bytes32 mode,bytes executionCalldata)'])
const tuple=[{type:'tuple[]',components:[{name:'target',type:'address'},{name:'value',type:'uint256'},{name:'callData',type:'bytes'}]}]
let cases=0
for(const network of ['bsc','xlayer'])for(const asset of crossBridgeAssets(network)){
 const {q,i}=fixture(network,'base',asset.symbol,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const binding={ownerId:'owner',fingerprint:'verified',source:{network,provider:'privy',walletId:'source',address:i.sender},destination:{network:'base',provider:'circle',walletId:'dest',address:i.recipient}}
 const {plan}=await buildCrossBridgeChargedPlan(route,binding,123n,treasury)
 const calls=plan.calls.map(c=>({to:c.target,value:'0x'+c.value.toString(16),data:c.data}))
 assert.equal(plan.callData,encodePrivyValueBatch(calls))
 const decoded=decodeFunctionData({abi,data:plan.callData});assert.equal(decoded.functionName,'execute');assert.equal(decoded.args[0],'0x01'+'00'.repeat(31),'atomic default Kernel batch')
 const [executions]=decodeAbiParameters(tuple,decoded.args[1]);assert.deepEqual(executions.map(c=>({target:c.target.toLowerCase(),value:c.value,data:c.callData})),plan.calls.map(c=>({...c,target:c.target.toLowerCase()})))
 const values=executions.reduce((v,c)=>v+c.value,0n);assert.equal(values,asset.native?BigInt(i.amountUnits)+123n:0n,'native principal plus approved reimbursement retained exactly')
 await assert.rejects(()=>buildCrossBridgeChargedPlan(route,{...binding,source:{...binding.source,provider:'circle'}},123n,treasury),/provider/)
 const methods=[],rpc=async(method,params)=>{methods.push(method);if(method==='eth_chainId')return network==='bsc'?'0x38':'0xc4';if(method==='eth_getCode')return '0xef0100'+kernel.slice(2);if(method==='eth_call')return '0x0';if(method==='eth_estimateUserOperationGas'){assert.equal(params[0].callData,plan.callData);assert.equal(params.length,2,'no balance/allowance overrides');return{callGasLimit:'0x10000',verificationGasLimit:'0x10000',preVerificationGas:'0x10000'}}throw Error(method)}
 assert.equal((await estimatePrivyValueBatchGas(rpc,i.sender,calls,network==='bsc'?56:196)).callData,plan.callData)
 assert.ok(methods.every(m=>!m.includes('send')&&!m.includes('sign')))
 if(asset.native){assert.throws(()=>encodeXLayerSponsoredBatch(calls));let touched=false;await assert.rejects(()=>estimatePrivySponsoredBatchGas(async()=>{touched=true},wallet,calls,56));assert.equal(touched,false,'legacy zero-value boundary unchanged')}
 cases++
}
for(const value of ['0x00','0x01','-1','1','0x','0x'+'f'.repeat(65)])assert.throws(()=>encodePrivyValueBatch([{to:wallet,data:'0x',value}]))
assert.throws(()=>encodePrivyValueBatch([{to:wallet,data:'0x',value:'0x'+'f'.repeat(64)},{to:wallet,data:'0x',value:'0x1'}]))
assert.throws(()=>encodePrivyValueBatch([{to:wallet,data:'0x1',value:'0x0'}]))
assert.throws(()=>encodePrivyValueBatch(Array.from({length:13},()=>({to:wallet,data:'0x',value:'0x0'}))))
const nativeCalls=[{to:treasury,data:'0x',value:'0x1'}]
let override
const firstUse=async(method,params)=>{if(method==='eth_chainId')return '0x38';if(method==='eth_getCode')return '0x';if(method==='eth_call')return params[0].to===kernel?'0x'+'0'.repeat(24)+XLAYER_ENTRY_POINT.slice(2):'0x0';if(method==='eth_estimateUserOperationGas'){override=params[2];return{callGasLimit:'0x1',verificationGasLimit:'0x1',preVerificationGas:'0x1'}}throw Error(method)}
await estimatePrivyValueBatchGas(firstUse,wallet,nativeCalls,56);assert.deepEqual(override,{[wallet]:{code:'0xef0100'+kernel.slice(2)}})
await assert.rejects(()=>estimatePrivyValueBatchGas(async()=> '0xc4',wallet,nativeCalls,56))
await assert.rejects(()=>estimatePrivyValueBatchGas(async(method,params)=>{if(method==='eth_estimateUserOperationGas')throw Error('insufficient native balance');return firstUse(method,params)},wallet,nativeCalls,56),/insufficient native/)
console.log('PASS '+cases+' BSC/X Layer assets: exact native/token calls, correct atomic Kernel encoding, provider binding, unsigned simulation, code-only first-use delegation, no balance injection and legacy zero-value rejection. Fixture only.')
