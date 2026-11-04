import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {readEvmBridgeDelivery} from '../api/pocket/bridge-evm-delivery.ts'
import {inboundChains} from '../api/pocket/inbound-bridge-networks.ts'
import {bscBridgeTokenAddress} from '../api/pocket/bsc-bridge-provider.ts'
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),anchor='0x'+'c'.repeat(64),recipient='0x'+'1'.repeat(40),sender='0x'+'2'.repeat(40)
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
let routes=0
for(const network of Object.keys(inboundChains))for(const asset of ['USDC','USDT']){
 if(network==='arc'&&asset==='USDT')continue
 const amount=network==='bsc'?10n**18n:1000000n
 function fixture(fault=''){let reads=0,calls=0;return {count:()=>calls,rpc:async({method,params})=>{
  calls++
  if(method==='eth_chainId')return fault==='network'||fault==='network-change'&&calls>4?'0xffff':'0x'+inboundChains[network].id.toString(16)
  if(method==='eth_getTransactionReceipt'){
   reads++;if(fault==='missing')return null
   const log={address:bscBridgeTokenAddress(network,asset),blockHash,blockNumber:'0x64',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x0',removed:fault==='removed',topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:sender,to:recipient}}),data:encodeAbiParameters([{type:'uint256'}],[fault==='changed'&&reads>1?amount+1n:amount])}
   return {status:fault==='reverted'?'0x0':'0x1',transactionHash:hash,blockHash,blockNumber:'0x64',transactionIndex:'0x0',logs:fault==='duplicate'?[log,log]:[log]}
  }
  if(method==='eth_getBlockByNumber'){
   if(params[0]==='finalized'){if(fault==='unsupported')throw Error('finalized unavailable');return {number:fault==='pending'?'0x63':'0x78',hash:anchor}}
   if(params[0]==='0x78')return {number:'0x78',hash:fault==='anchor'?blockHash:anchor}
   return {number:'0x64',hash:fault==='reorg'&&reads>1?anchor:blockHash,transactions:fault==='membership'?[]:[hash]}
  }
  assert.fail('Unexpected request '+method)
 }}}
 const good=fixture();assert.equal(await readEvmBridgeDelivery(network,asset,recipient,hash,{rpc:good.rpc}),amount);assert.equal(good.count(),9)
 for(const fault of ['network','network-change','missing','removed','changed','reverted','duplicate','pending','unsupported','anchor','reorg','membership'])await assert.rejects(()=>readEvmBridgeDelivery(network,asset,recipient,hash,{rpc:fixture(fault).rpc}),fault)
 assert.equal(await readEvmBridgeDelivery(network,asset,sender,hash,{rpc:fixture().rpc}),-amount,'Net sender debit is not positive delivery')
 routes++
}
console.log(`PASS ${routes} EVM asset/network delivery readers: nine bounded reads, finality, exact log binding, canonical membership, changed evidence and reorg rejection; no trace/latest/head fallback. Simulated RPC only.`)
