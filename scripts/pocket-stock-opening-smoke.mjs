import assert from 'node:assert/strict'
import {stockSharePositions} from '../api/pocket/stock-share-basis.ts'
import {stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
for(const asset of stockAssets){
 const token=asset.address.toLowerCase(),opening={[token]:{at:100,quantity:'2',costUsd:'20',shares:true}}
 const old={id:'old',hash:'old',at:1,transfer:{token,symbol:asset.symbol,amount:'2',direction:'in'}}
 let r=stockSharePositions([old],{}, {},opening)
 assert.deepEqual(r.positions[token],{quantity:'2',costUsd:'20'},'Old test transfers do not poison an explicitly chosen opening value')
 assert.ok(r.shareTokens.has(token))
 const sell={id:'sell',hash:'sell',at:101,trade:{input:{symbol:asset.symbol,amount:'1'},output:{symbol:'USDC',amount:'12'}}}
 const evidence={sell:{tokens:{[token]:{incoming:'0',outgoing:'1000000000000000000',decimals:18}}}}
 r=stockSharePositions([old,sell],{},evidence,opening)
 assert.deepEqual(r.positions[token],{quantity:'1',costUsd:'10'},'Sales release opening value proportionally')
 assert.equal(stockSharePositions([old,sell],{}, {},opening).positions[token].costUsd,null,'Missing evidence after opening is still unknown')
 const gift={...old,id:'new',hash:'new',at:102}
 assert.equal(stockSharePositions([old,gift],{},{new:{tokens:{[token]:{incoming:'1000000000000000000',outgoing:'0',decimals:18}}}},opening).positions[token].costUsd,null,'Later transfers do not silently reset the opening value')
}
const [a,b]=stockAssets,token=a.address.toLowerCase(),other=b.address.toLowerCase()
const purchase={id:'buy',hash:'buy',at:1,trade:{input:{symbol:'USDC',amount:'30'},output:{symbol:b.symbol,amount:'3'}}}
const mixed=stockSharePositions([purchase],{buy:'30'},{buy:{tokens:{}}},{[token]:{at:100,quantity:'2',costUsd:'20',shares:true}})
assert.deepEqual(mixed.positions[other],{quantity:'3',costUsd:'30'},'Other stocks retain their actual purchase cost')
console.log('PASS explicit opening values across 808 assets, partial sales, future evidence gaps, incoming transfers and unrelated purchase preservation')
