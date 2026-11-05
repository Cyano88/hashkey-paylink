import assert from 'node:assert/strict'
import {nativeBridgeTraceDelta} from '../api/pocket/bridge-native-delivery.ts'
import {readCrossBridgeDelivery} from '../api/pocket/cross-bridge-delivery.ts'
import {crossBridgeAsset} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {inboundChains} from '../api/pocket/inbound-bridge-networks.ts'
const sender='0x'+'1'.repeat(40),router='0x'+'2'.repeat(40),recipient='0x'+'3'.repeat(40),hash='0x'+'a'.repeat(64),block='0x'+'b'.repeat(64),anchor='0x'+'c'.repeat(64)
const call=(from,to,value,calls=[])=>({type:'CALL',from,to,input:'0x',value:'0x'+value.toString(16),calls})
const trace=call(sender,router,0n,[call(router,recipient,12n,[call(recipient,router,2n)])])
assert.equal(nativeBridgeTraceDelta(trace,recipient),10n)
assert.equal(nativeBridgeTraceDelta({...trace,calls:[{...call(router,recipient,100n),error:'revert'},...trace.calls]},recipient),10n)
assert.equal(nativeBridgeTraceDelta({...trace,calls:[{...call(router,recipient,100n,[call(router,recipient,100n)]),revertReason:'parent reverted'},...trace.calls]},recipient),10n)
assert.equal(nativeBridgeTraceDelta({...trace,calls:[{...call(router,recipient,100n),type:'DELEGATECALL'},...trace.calls]},recipient),10n)
for(const t of [{...trace,from:recipient},{...trace,error:'revert'},{...trace,calls:[{...call(router,recipient,100n),type:'SELFDESTRUCT'}]},{...trace,calls:[{...call(router,recipient,100n),type:'CREATE'}]},{...trace,calls:[{...call(router,recipient,1n),value:'-1'}]},{...trace,calls:'broken'}])assert.throws(()=>nativeBridgeTraceDelta(t,recipient))
for(const network of ['ethereum','base','arbitrum','polygon','bsc','xlayer']){
 let fault='',traces=0,txReads=0
 const token=crossBridgeAsset(network,network==='bsc'?'BNB':network==='xlayer'?'OKB':network==='polygon'?'POL':'ETH')
 const rpc=async({method,params})=>{
  if(method==='eth_chainId')return '0x'+(fault==='chain'?(network==='polygon'?1:137):inboundChains[network].id).toString(16)
  if(method==='eth_getTransactionReceipt')return {transactionHash:hash,blockHash:block,blockNumber:'0x1',transactionIndex:'0x0',status:fault==='receipt'&&traces>0?'0x0':'0x1',logs:[]}
  if(method==='eth_getBlockByNumber')return params[0]==='0x1'?{hash:fault==='reorg'&&traces>0?anchor:block,number:'0x1',transactions:fault==='membership'?[]:[hash]}:{hash:anchor,number:fault==='unfinalized'?'0x0':'0x10',transactions:[]}
  if(method==='eth_getTransactionByHash'){txReads++;return {hash:fault==='hash'?anchor:hash,blockHash:fault==='txBlock'?anchor:block,blockNumber:'0x1',transactionIndex:'0x0',chainId:'0x'+inboundChains[network].id.toString(16),from:sender,to:router,input:fault==='txChanged'&&txReads>1?'0x1234':'0x',value:'0x0'}}
  if(method==='debug_traceTransaction'){traces++;if(fault==='noTrace')throw Error('No trace method');if(fault==='traceBinding')return {...trace,from:router};if(fault==='traceChanged'&&traces>1)return {...trace,calls:[]};return trace}
  assert.fail(method)
 }
 const candidate={network,token,recipient,hash,outcome:'completed',exactUnits:null,minimumUnits:'10'}
 const read=()=>readCrossBridgeDelivery(candidate,{rpc})
 assert.equal(await read(),10n)
 for(const f of ['chain','receipt','reorg','membership','unfinalized','hash','txBlock','txChanged','noTrace','traceBinding','traceChanged']){fault=f;traces=txReads=0;await assert.rejects(read,f)}
 console.log('PASS '+network+' native delivery: exact finalized transaction and trace, net received value, fresh evidence; unavailable tracing, binding mismatch, mutation and reorg reject settlement.')
}
