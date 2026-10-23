import assert from 'node:assert/strict'
import { selectStockQuotes } from '../src/pocket/hooks/usePocketStockQuotes.ts'
import { resolvePocketRoute, pocketPathFor } from '../src/pocket/lib/pocketRoutes.ts'
import { xStockNavPath } from '../src/pocket/lib/pocketRail.ts'
import { readFileSync } from 'node:fs'

const address = '0x1234567890123456789012345678901234567890'
const valid = { chainId:'xlayer', baseToken:{address}, priceUsd:'101.25', liquidity:{usd:10000}, priceChange:{h24:2.5}, volume:{h24:400} }
assert.deepEqual(selectStockQuotes([], [address], 1), {})
assert.deepEqual(selectStockQuotes([{...valid,chainId:'ethereum'}], [address], 1), {})
assert.deepEqual(selectStockQuotes([{...valid,baseToken:{address:'0x9999'}}], [address], 1), {})
assert.deepEqual(selectStockQuotes([{...valid,priceUsd:'NaN'}, {...valid,priceUsd:'0'}, {...valid,liquidity:{usd:0}}], [address], 1), {})
const chosen=selectStockQuotes([{...valid,liquidity:{usd:10},priceUsd:'9000'},valid], [address], 123)
assert.equal(chosen[address].usd,101.25)
assert.equal(chosen[address].fetchedAt,123)
assert.equal(selectStockQuotes([{...valid,priceChange:{h24:NaN}}],[address],1)[address].change,null)
assert.throws(()=>selectStockQuotes({},[address],1))
for(const view of ['home','market','portfolio','activity','account','send','receive','trade','request','notifications','verify-name']){
 assert.deepEqual(resolvePocketRoute('/xstocks/'+view),{section:'xstocks',view})
 assert.equal(pocketPathFor({section:'xstocks',view}),'/xstocks/'+view)
}
assert.equal(resolvePocketRoute('/xstocks/unknown'),null)
assert.deepEqual(resolvePocketRoute('/home/swap'),{section:'home',view:'swap'})
for(const tab of ['home','bills','activity','profile']) assert.match(xStockNavPath(tab),/\/xstocks\//)
const catalogue=JSON.parse(readFileSync('src/pocket/lib/pocketXStocksCatalog.json','utf8'))
assert.equal(catalogue.source,'https://xstocks.com/products')
assert.equal(new Set(catalogue.assets.map(a=>a.symbol)).size,catalogue.assets.length)
assert.ok(catalogue.assets.every(a=>/^0x[0-9a-f]{40}$/i.test(a.address)))
console.log('PASS: stock routing isolation, issuer catalogue integrity, wrong-chain/wrong-contract/invalid-price rejection and highest-liquidity quote selection.')
