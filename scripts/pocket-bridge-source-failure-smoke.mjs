import assert from 'node:assert/strict'
import {proveBridgeSourceFailure,readBridgeSourceFailure} from '../api/pocket/bridge-source-failure.ts'
const wallet='0x'+'1'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),anchor='0x'+'c'.repeat(64),q={source:'base',walletAddress:wallet,callData:'0x12345678'}
const trace={type:'CALL',to:wallet,input:q.callData,error:'execution reverted'},receipt={status:'success',transactionHash:hash,logs:[]}
assert.equal(proveBridgeSourceFailure(q,receipt,trace).failed,true)
assert.equal(proveBridgeSourceFailure(q,receipt,{...trace,error:undefined}).failed,false)
assert.equal(proveBridgeSourceFailure(q,receipt,{type:'CALL',error:'parent reverted',calls:[{...trace,error:undefined}]}).failed,true)
for(const t of [{...trace,to:hash},{...trace,input:'0x12345679'},{type:'CALL',calls:[trace,trace]},{type:'DELEGATECALL',to:wallet,input:q.callData}])assert.throws(()=>proveBridgeSourceFailure(q,receipt,t))
function rpc(fault=''){let traced=false;return async({method,params})=>{
 if(method==='eth_chainId')return fault==='chain'?'0x1':'0x2105'
 if(method==='eth_getTransactionReceipt')return {transactionHash:hash,status:fault==='changed'&&traced?'0x1':'0x0',blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:[]}
 if(method==='eth_getBlockByNumber'){if(params[0]==='finalized')return {number:fault==='unfinalized'?'0x63':'0x78',hash:anchor};if(params[0]==='0x78')return {number:'0x78',hash:anchor};return {number:'0x64',hash:fault==='reorg'&&traced?anchor:blockHash,transactions:[hash]}}
 if(method==='debug_traceTransaction'){traced=true;if(fault==='no-trace')throw Error('unavailable');return fault==='wrong-call'?{...trace,input:'0x12345679'}:trace}
 assert.fail(method)
}}
assert.equal(await readBridgeSourceFailure(q,hash,rpc()),true)
for(const fault of ['chain','changed','unfinalized','reorg','no-trace','wrong-call'])await assert.rejects(()=>readBridgeSourceFailure(q,hash,rpc(fault)),fault)
console.log('PASS source failure: exact unique wallet calldata and inherited revert; finalized receipt/block/chain binding; changed outcome, reorg, missing trace and wrong call cannot release funds. Simulated RPC only.')
