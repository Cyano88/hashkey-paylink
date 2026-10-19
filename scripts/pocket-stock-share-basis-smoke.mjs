import assert from 'node:assert/strict'
import {stockSharePositions} from '../api/pocket/stock-share-basis.ts'
import {stockAssets} from '../src/pocket/lib/pocketXStocksWallet.ts'
for(const asset of stockAssets){
 const token=asset.address.toLowerCase()
 const buy={id:'buy',hash:'buy',at:1,trade:{input:{symbol:'USDC',amount:'10'},output:{symbol:asset.symbol,amount:'2'}}}
 const raw={id:'raw',hash:'buy',at:1,transfer:{token,symbol:asset.symbol,amount:'2',direction:'in'}}
 const sell={id:'sell',hash:'sell',at:2,trade:{input:{symbol:asset.symbol,amount:'1.5'},output:{symbol:'USDC',amount:'12'}}}
 const evidence={buy:{tokens:{[token]:{incoming:'1000000000000000000',outgoing:'0',decimals:18}}},sell:{tokens:{[token]:{incoming:'0',outgoing:'500000000000000000',decimals:18}}}}
 const result=stockSharePositions([buy,raw,sell],{buy:'10'},evidence)
 assert.deepEqual(result.positions[token],{quantity:'0.5',costUsd:'5'},asset.symbol+' uses immutable shares through multiplier changes')
 assert.ok(result.shareTokens.has(token))
 assert.equal(stockSharePositions([buy,raw,sell],{buy:'10'},{buy:evidence.buy}).positions[token].costUsd,null,'Missing receipt cannot fabricate a return')
 const gift={...raw,id:'gift',hash:'gift',at:3}
 assert.equal(stockSharePositions([buy,sell,gift],{buy:'10'},{...evidence,gift:evidence.buy}).positions[token].costUsd,null,'External shares never silently become zero cost')
 const plain=stockSharePositions([buy],{buy:'10'},{buy:{tokens:{}}})
 assert.deepEqual(plain.positions[token],{quantity:'2',costUsd:'10'},'Non-rebasing assets keep nominal accounting')
}
console.log('PASS share accounting, rebase partial sales, raw-leg deduplication, incomplete evidence and external transfers for all '+stockAssets.length+' stocks')
