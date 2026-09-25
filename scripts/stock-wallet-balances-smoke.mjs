import assert from 'node:assert/strict'
import { createStockWalletBalancesHandler } from '../api/stock-wallet-balances.ts'
import { cliRequestScope } from '../api/developer-cli-grants.ts'
const address='0x'+'1'.repeat(40),asset='0x'+'2'.repeat(40),now=Date.now()
let complete=true,stale=false,priced=true,authorized=true,seen
const handler=createStockWalletBalancesHandler({now:()=>now,policy:async()=>authorized?{partnerId:'project_a',environment:'live',checkoutMode:'human'}:null,balances:async(owner,wallet)=>{seen={owner,wallet};return {holdings:[{asset:{address:asset,symbol:'TESTx',name:'Test',icon:''},units:125n,decimals:2}],cash:0n,gas:123456789012345678n,complete,observedAt:stale?now-61000:now,blockNumber:123n,blockHash:'0x01',fullScanAt:now}},prices:async()=>priced?{[asset]:{usd:10,fetchedAt:now,change:null,volume:0}}:{}})
async function call(wallet=address,method='POST'){const res={setHeader(){},status(n){this.statusCode=n;return this},statusCode:200,json(body){this.body=body;return this}};await handler({method,body:{wallet},headers:{},originalUrl:'/api/v2/wallets/stocks/balances'},res);return res}
let r=await call();assert.equal(r.body.estimatedValueUsd,12.5);assert.equal(r.body.holdings[0].balance,'1.25');assert.equal(seen.owner,'developer:project_a')
assert.equal(r.body.gas.balance,'0.123456789012345678');assert.equal(r.body.gas.symbol,'OKB');assert.equal(r.body.receive.chainId,196);assert.equal(r.body.receive.qrValue,address);assert.equal(r.body.receive.pocketIdRouting,'not_provided')
priced=false;r=await call();assert.equal(r.body.estimatedValueUsd,null);assert.equal(r.body.pricingComplete,false)
priced=true;complete=false;assert.equal((await call()).body.estimatedValueUsd,null)
complete=true;stale=true;assert.equal((await call()).body.estimatedValueUsd,null)
assert.equal((await call('bad')).statusCode,400);assert.equal((await call(address,'GET')).statusCode,405)
authorized=false;assert.equal((await call()).statusCode,403)
console.log('Stock API checks passed: shared read service, project cache scope, exact units, complete pricing, partial/stale unknown totals, invalid input and denied access.')

assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/stocks/balances'}),'wallet:stocks:read')
assert.equal(cliRequestScope({method:'GET',originalUrl:'/api/v2/wallets/stocks/balances'}),null)
