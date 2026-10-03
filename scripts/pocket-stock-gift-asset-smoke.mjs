import assert from 'node:assert/strict'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
import {readStockGiftAsset,preflightStockGiftCall,sameStockGiftAsset} from '../src/pocket/api/pocketStockGiftAsset.ts'
const token=catalogue.assets[0].address,client={getChainId:async()=>196,readContract:async()=>18}
const a=await readStockGiftAsset(token,client);assert.equal(a.symbol,catalogue.assets[0].symbol);assert.equal(a.decimals,18);assert.equal(sameStockGiftAsset(a,{...a,decimals:6}),false)
await assert.rejects(()=>readStockGiftAsset('0x'+'0'.repeat(40),client));await assert.rejects(()=>readStockGiftAsset(token,{...client,getChainId:async()=>8453}));await assert.rejects(()=>readStockGiftAsset(token,{...client,readContract:async()=>37}))
const rpc={getChainId:async()=>196,estimateGas:async()=>100n,getGasPrice:async()=>2n,getBalance:async()=>240n},call={to:a.token,data:'0x12345678',value:0n};assert.equal((await preflightStockGiftCall(a.token,call,rpc)).maximumFee,240n);await assert.rejects(()=>preflightStockGiftCall(a.token,call,{...rpc,getBalance:async()=>239n}));await assert.rejects(()=>preflightStockGiftCall(a.token,{...call,value:1n},rpc))
console.log('PASS stock gift catalogue identity, chain and precision validation, RPC fee estimation and insufficient fee rejection.')
