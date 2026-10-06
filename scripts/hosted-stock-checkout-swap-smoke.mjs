import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {normalizeXLayerCheckoutConfig,xlayerCheckoutAssets} from '../src/lib/xlayerCheckoutConfig.ts'
const wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),token=xlayerCheckoutAssets[1].address
assert.equal(normalizeXLayerCheckoutConfig(null),undefined)
assert.deepEqual(normalizeXLayerCheckoutConfig({recipient:wallet,assets:[token,token]}).assets,[token.toLowerCase()])
for(const value of [{recipient:'bad',assets:[token]},{recipient:'0x'+'0'.repeat(40),assets:[token]},{recipient:wallet,assets:[]},{recipient:wallet,assets:[other]}])assert.throws(()=>normalizeXLayerCheckoutConfig(value))
const mocks={
 './hosted-stock-checkouts.js':`export const readStockCheckout=async id=>globalThis.fixture.orders[id];export const assertStockCheckoutPayable=async(r,swap)=>{if(!swap||!r.swapEnabled||globalThis.fixture.disabled)throw Object.assign(Error('Conversion disabled'),{status:403})}`,
 './privy-circle-link.js':`export const verifiedPrivyUser=async()=>({userId:globalThis.fixture.user})`,
 './pocket/xstocks-wallet-owner.js':`export const verifyStockWalletOwner=async(user,wallet)=>{if(user!=='payer'||wallet!==globalThis.fixture.wallet)throw Object.assign(Error('Wrong owner'),{status:403})}`,
 './developer-environment.js':`export const assertLiveDeveloperRequest=req=>{if(req.body.environment==='test')throw Object.assign(Error('Live only'),{status:409})}`,
 './pocket/xstocks-swap-provider.js':`export const quoteStockSwap=async input=>({owner:input.owner,tokenOut:{address:input.tokenOut}});export const sealStockQuote=(quote,scope)=>JSON.stringify({quote,scope});export const openStockQuote=(token,scope)=>{const data=JSON.parse(token);if(data.scope!==scope)throw Object.assign(Error('Wrong checkout scope'),{status:403});return data.quote}`
}
await build({entryPoints:['api/hosted-stock-checkout-swap.ts'],outfile:'.codex-temp/stock-swap-api-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {default:handler}=await import('../.codex-temp/stock-swap-api-test.mjs')
globalThis.fixture={wallet,user:'payer',orders:{one:{id:'one',token:{address:token},swapEnabled:true},two:{id:'two',token:{address:token},swapEnabled:true}}}
async function call(body,id='one'){let status=200,data;await handler({method:'POST',query:{id},body},{setHeader(){},status(n){status=n;return this},json(d){data=d;return this},sendStatus(n){status=n}});return{status,data}}
const body={action:'quote',wallet,tokenIn:other,tokenOut:token,amount:'1'}
assert.equal((await call(body,'missing')).status,404)
assert.equal((await call({...body,environment:'test'})).status,409)
fixture.disabled=true;assert.equal((await call(body)).status,403);fixture.disabled=false
fixture.orders.one.swapEnabled=false;assert.equal((await call(body)).status,403);fixture.orders.one.swapEnabled=true
assert.equal((await call({...body,wallet:other})).status,403)
assert.equal((await call({...body,tokenOut:other})).status,400)
const quote=await call(body);assert.equal(quote.status,200)
const verify={action:'verify',wallet,quoteToken:quote.data.quoteToken}
assert.equal((await call(verify)).status,200)
assert.equal((await call(verify,'two')).status,403)
fixture.user='stranger';assert.equal((await call(verify)).status,403);fixture.user='payer'
const wrong=JSON.parse(verify.quoteToken);wrong.quote.tokenOut.address=other
assert.equal((await call({...verify,quoteToken:JSON.stringify(wrong)})).status,409)
fixture.disabled=true;assert.equal((await call(verify)).status,403)
console.log('PASS checkout conversion: project permission, wallet ownership, output asset, order-scoped quote, disable-before-approval and configuration validation.')
