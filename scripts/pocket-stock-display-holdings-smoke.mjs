import assert from 'node:assert/strict'
import {canonicalStockHoldings} from '../api/pocket/stock-display-holdings.ts'
const asset={address:'0xc845b2894dbddd03858fd2d643b4ef725fe0849d',symbol:'NVDAx'},holding={asset,decimals:18,units:10748879624533528n}
let calls=0
const client={multicall:async({contracts})=>{calls++;assert.equal(contracts.length,1);return[{status:'success',result:10767165584165913n}]}}
assert.equal((await canonicalStockHoldings('0xf3853789e1d4f227bca68e522240f1ca139babd1',[holding],client))[0].units,10767165584165913n)
assert.equal(calls,1,'One batch for held assets, no catalogue scan')
assert.deepEqual(await canonicalStockHoldings('wallet',[],client),[]);assert.equal(calls,1)
await assert.rejects(()=>canonicalStockHoldings('wallet',[holding],{multicall:async()=>[{status:'failure'}]}),/verification unavailable/)
assert.deepEqual(await canonicalStockHoldings('wallet',[holding],{multicall:async()=>[{status:'success',result:0n}]}),[])
console.log('PASS canonical stock balances, rebase correction, zero holdings and incomplete RPC evidence')
