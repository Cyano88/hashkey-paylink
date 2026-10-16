import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,encodeFunctionData,parseAbi} from 'viem'
import {priceXLayerReimbursement,assertXLayerReimbursementCoverage} from '../api/pocket/xlayer-sponsored-cost.ts'
import {entryPoint07Abi} from 'viem/account-abstraction'
import {XLAYER_ENTRY_POINT,encodeXLayerSponsoredBatch,estimateXLayerSponsoredBatchGas,readXLayerSponsoredNetworkCost,reconcileXLayerQuotedReimbursement} from '../api/pocket/xlayer-sponsored-cost.ts'

const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const transactionHash='0x'+'aa'.repeat(32),userOperationHash='0x'+'bb'.repeat(32),blockHash='0x'+'cc'.repeat(32)
const calls=[{to:recipient,data:'0x1234',value:'0x0'}],callData=encodeXLayerSponsoredBatch(calls)
const binding={wallet,transactionHash,userOperationHash,callData}
const operation={sender:wallet,nonce:0n,initCode:'0x',callData,accountGasLimits:'0x'+'00'.repeat(32),preVerificationGas:0n,gasFees:'0x'+'00'.repeat(32),paymasterAndData:'0x',signature:'0x'+'11'.repeat(65)}
const eventAbi=parseAbi(['event UserOperationEvent(bytes32 indexed userOpHash,address indexed sender,address indexed paymaster,uint256 nonce,bool success,uint256 actualGasCost,uint256 actualGasUsed)'])
function harness(){
 const state={chain:'0xc4',entrypoint:'0x'+'0'.repeat(24)+XLAYER_ENTRY_POINT.slice(2),code:'0xef0100d6cedde84be40893d153be9d467cd6ad37875b28',gas:{callGasLimit:'0x10000',verificationGasLimit:'0x10000',preVerificationGas:'0x10000'},block:{hash:blockHash},
  tx:{hash:transactionHash,to:XLAYER_ENTRY_POINT,chainId:'0xc4',blockHash,blockNumber:'0x1',type:'0x2',input:encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[operation],recipient]})},
  receipt:{status:'0x1',transactionHash,to:XLAYER_ENTRY_POINT,blockHash,blockNumber:'0x1',gasUsed:'0x186a0',effectiveGasPrice:'0x1312d00',l1Fee:'0x64',blobGasUsed:'0x27290',logs:[{address:XLAYER_ENTRY_POINT,topics:encodeEventTopics({abi:eventAbi,eventName:'UserOperationEvent',args:{userOpHash:userOperationHash,sender:wallet,paymaster:'0x'+'00'.repeat(20)}}),data:encodeAbiParameters([{type:'uint256'},{type:'bool'},{type:'uint256'},{type:'uint256'}],[0n,true,0n,90000n])}]}}
 const invoked=[]
 const rpc=async(method,params)=>{invoked.push(method);switch(method){case 'eth_chainId':return state.chain;case 'eth_getCode':return state.code;case 'eth_call':return params[0].to.toLowerCase()==='0xd6cedde84be40893d153be9d467cd6ad37875b28'?state.entrypoint:'0x0';case 'eth_estimateUserOperationGas':assert.equal(params[0].callData,callData);assert.equal(params[0].signature.length,132);if(state.code==='0x')assert.deepEqual(params[2],{[wallet]:{code:'0xef0100d6cedde84be40893d153be9d467cd6ad37875b28'}});else assert.equal(params.length,2);return state.gas;case 'eth_getTransactionReceipt':return state.receipt;case 'eth_getTransactionByHash':return state.tx;case 'eth_getBlockByNumber':return state.block;default:throw Error('Unexpected RPC: '+method)}}
 return {state,rpc,invoked}
}
const h=harness()
const gas=await estimateXLayerSponsoredBatchGas(h.rpc,wallet,calls)
assert.equal(gas.totalGas,196608n)
const actual=await readXLayerSponsoredNetworkCost(h.rpc,binding)
assert.equal(actual.networkCostWei,2000000000100n,'zero UserOperation cost must not erase paid outer gas; include L1 fee')
assert.equal(actual.blobFeeWei,0n,'non-blob transaction DA footprint is not another fee')
assert.ok(h.invoked.every(m=>!m.includes('send')&&!m.includes('sign')))
const firstUse=harness();firstUse.state.code='0x'
assert.equal((await estimateXLayerSponsoredBatchGas(firstUse.rpc,wallet,calls)).requiresDelegation,true)
assert.equal(firstUse.state.code,'0x','estimation does not change actual delegation')
firstUse.state.entrypoint='0x'+'00'.repeat(32)
await assert.rejects(()=>estimateXLayerSponsoredBatchGas(firstUse.rpc,wallet,calls))
for(const mutate of [s=>s.chain='0x7a0',s=>s.code='0x6000',s=>s.code='0xef0100'+'ff'.repeat(20),s=>s.gas.callGasLimit='0x0',s=>s.gas.verificationGasLimit='bad',s=>s.gas.preVerificationGas='0xffffffffff']){
 const test=harness();mutate(test.state);await assert.rejects(()=>estimateXLayerSponsoredBatchGas(test.rpc,wallet,calls))
}
for(const mutate of [s=>s.chain='0x7a0',s=>s.block.hash=transactionHash,s=>s.tx.hash=userOperationHash,s=>s.receipt.status='0x0',s=>s.receipt.to=wallet,s=>delete s.receipt.l1Fee,s=>s.receipt.logs[0].address=wallet,s=>s.receipt.logs.push(s.receipt.logs[0]),s=>s.tx.input=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[operation,operation],recipient]}),s=>s.tx.input=encodeFunctionData({abi:entryPoint07Abi,functionName:'handleOps',args:[[{...operation,callData:'0x1234'}],recipient]}),s=>s.tx.type='0x3',s=>{s.tx.type='0x4';s.tx.authorizationList=[]}]){
 const test=harness();mutate(test.state);await assert.rejects(()=>readXLayerSponsoredNetworkCost(test.rpc,binding))
}
for(const changed of [{wallet:recipient},{transactionHash:userOperationHash},{userOperationHash:transactionHash},{callData:'0x1234'}])await assert.rejects(()=>readXLayerSponsoredNetworkCost(h.rpc,{...binding,...changed}))
const pending=harness();pending.state.receipt=null;assert.equal(await readXLayerSponsoredNetworkCost(pending.rpc,binding),null)
assert.deepEqual(reconcileXLayerQuotedReimbursement(100n,10n**10n,100n*10n**8n),{actualUnits:1n,collectedUnits:100n,retainedSurplusUnits:99n,absorbedUnits:0n})
assert.deepEqual(reconcileXLayerQuotedReimbursement(100n,10n**18n,100n*10n**8n),{actualUnits:100000000n,collectedUnits:100n,retainedSurplusUnits:0n,absorbedUnits:99999900n})
assert.equal(reconcileXLayerQuotedReimbursement(100n,1n,1n).actualUnits,1n,'round upwards only to smallest token unit')
assert.throws(()=>reconcileXLayerQuotedReimbursement(0n,1n,1n))
// 25% is a test fixture, not a production margin setting.
assert.equal(priceXLayerReimbursement(100n,2500,0n),125n)
assert.equal(priceXLayerReimbursement(1n,1,0n),2n)
assert.equal(priceXLayerReimbursement(100n,2500,200n),200n)
assert.equal(assertXLayerReimbursementCoverage(125n,80n,2500,0n),125n)
assert.throws(()=>assertXLayerReimbursementCoverage(125n,101n,2500,0n),/Network fee increased/)
for(const margin of [0,-1,0.5,NaN,Infinity,10001])assert.throws(()=>priceXLayerReimbursement(100n,margin,0n))
assert.throws(()=>priceXLayerReimbursement(0n,2500,0n))
assert.throws(()=>priceXLayerReimbursement(100n,2500,-1n))
console.log('PASS unsigned Privy-format batch simulation, canonical single-operation outer cost, wrong-chain/reorg/bundle isolation, L1 fee accounting, retained quoted reimbursement and no additional user charge. No funds moved.')

