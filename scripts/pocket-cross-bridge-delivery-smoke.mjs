import assert from 'node:assert/strict'
import {encodeAbiParameters,encodeEventTopics,parseAbi} from 'viem'
import {readCrossBridgeDelivery,observeCrossBridgeDelivery} from '../api/pocket/cross-bridge-delivery.ts'
import {CROSS_BRIDGE_ROLLOUT_NETWORKS,crossBridgeAssets} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
const hash='0x'+'a'.repeat(64),block='0x'+'b'.repeat(64),anchor='0x'+'c'.repeat(64),recipient='0x'+'1'.repeat(40),sender='0x'+'2'.repeat(40),abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
let count=0
for(const network of CROSS_BRIDGE_ROLLOUT_NETWORKS){if(network==='solana')continue;for(const token of crossBridgeAssets(network)){
 const c={network,token,recipient,hash,outcome:'completed',exactUnits:null,minimumUnits:'1'}
 let fault='',reads=0
 const rpc=async({method,params})=>{
  reads++
  if(method==='eth_chainId')return '0x'+RELAY_BSC_CHAINS[network].id.toString(16)
  if(method==='eth_getBlockByNumber')return params[0]==='0x1'?{hash:fault==='reorg'&&reads>5?anchor:block,number:'0x1',transactions:[hash]}:{hash:anchor,number:fault==='unfinalized'?'0x0':'0x10',transactions:[]}
  if(method==='eth_getTransactionReceipt')return {transactionHash:hash,blockHash:block,blockNumber:'0x1',transactionIndex:'0x0',status:'0x1',logs:[[sender,recipient,12n],[recipient,sender,2n]].map(([from,to,value],i)=>({address:token.address,data:encodeAbiParameters([{type:'uint256'}],[value]),topics:encodeEventTopics({abi,eventName:'Transfer',args:{from,to}}),removed:fault==='removed',blockHash:block,blockNumber:'0x1',transactionHash:hash,transactionIndex:'0x0',logIndex:'0x'+i}))}
  assert.fail(method)
 }
 if(token.native)continue // Covered by pocket-bridge-native-delivery-smoke.mjs.
 assert.equal(await readCrossBridgeDelivery(c,{rpc}),10n);count++
 for(const f of ['reorg','unfinalized','removed']){fault=f;reads=0;await assert.rejects(()=>readCrossBridgeDelivery(c,{rpc}))}
 fault='unfinalized';reads=0;assert.equal(await observeCrossBridgeDelivery(c,{rpc}),10n)
 for(const f of ['reorg','removed']){fault=f;reads=0;await assert.rejects(()=>observeCrossBridgeDelivery(c,{rpc}))}
 assert.equal(await observeCrossBridgeDelivery({...c,outcome:'refunded'},{rpc}),null)
 await assert.rejects(()=>readCrossBridgeDelivery({...c,token:{...token,decimals:token.decimals+1}},{rpc}))
}}
console.log('PASS '+count+' non-Arc ERC20 delivery assets: exact token/net receipt, canonical finality and reorg/removed-log rejection. Native outputs have a separate exact trace regression. Solana delegates to the separately tested finalized stablecoin reader.')
