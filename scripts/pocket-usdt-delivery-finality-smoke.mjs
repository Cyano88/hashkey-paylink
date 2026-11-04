import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {chainReceived} from '../api/pocket/solana-usdt-bridge-settlement.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),anchor='0x'+'c'.repeat(64),recipient='0x'+'1'.repeat(40),sender='0x'+'2'.repeat(40)
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
for(const network of ['base','arbitrum']){
 const reader=(fault='')=>{let traced=false;return async({method,params})=>{
  if(method==='eth_chainId')return fault==='network'?'0x1':network==='base'?'0x2105':'0xa4b1'
  if(method==='debug_traceTransaction'){traced=true;return {type:'CALL'}}
  if(method==='eth_getTransactionReceipt'){
   if(fault==='missing')return null
   return {status:'0x1',transactionHash:hash,blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:[{
    address:POCKET_USDT_ASSETS[network].address,blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:fault==='removed',
    topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:sender,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[fault==='changed'&&traced?2000n:1000n])
   }]}
  }
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='finalized')return {number:fault==='pending'?'0x63':'0x78',hash:anchor}
   if(params[0]==='0x78')return {number:'0x78',hash:anchor}
   return {number:'0x64',hash:fault==='reorg'&&traced?anchor:blockHash,transactions:fault==='membership'?[]:[hash]}
  }
  assert.fail(method)
 }}
 assert.equal(await chainReceived(network,hash,recipient,reader()),1000n)
 for(const fault of ['network','missing','removed','changed','pending','reorg','membership'])await assert.rejects(()=>chainReceived(network,hash,recipient,reader(fault)),fault)
}
console.log('PASS Base/Arbitrum USDT settlement: finalized canonical receipt, exact token delta, wrong chain, missing/changed/removed evidence and reorg rejection. Simulated RPC only.')
