import assert from 'node:assert/strict'
import {createProviderUsage,providerFromEndpoint,providerErrorOutcome,withProviderFeature,providerUsageFetch,providerRpcFetch,circleUsageOperation,providerUsage} from '../api/pocket/provider-usage.ts'
let now=1000;const reports=[],usage=createProviderUsage(()=>now,r=>reports.push(r))
assert.equal(providerFromEndpoint('https://base-mainnet.g.alchemy.com/v2/SECRET?key=PRIVATE'),'alchemy')
assert.equal(providerFromEndpoint('https://alchemy.com.evil.test/SECRET'),'other')
assert.equal(providerFromEndpoint('https://api.circle.com/v1/wallets/private'),'circle')
assert.equal(providerFromEndpoint('https://web3.okx.com/api/path?address=private'),'okx')
assert.equal(providerFromEndpoint('https://mainnet.base.org'),'public-rpc')
const result={verified:true};assert.equal(await usage.observe({endpoint:'https://base-mainnet.g.alchemy.com/v2/SECRET',network:'base',operation:'eth_getLogs'},async()=>result),result)
const error=Object.assign(Error('secret url and private wallet'),{reason:'quota'});await assert.rejects(()=>usage.observe({provider:'alchemy',network:'base',operation:'eth_getLogs'},async()=>{throw error}),e=>e===error)
const finish=usage.begin({provider:'okx',operation:'history-page'});now+=20;finish('http-ok');finish('http-error')
usage.record({feature:'PRIVATE_WALLET',network:'SECRET',operation:'API_KEY',provider:'PRIVATE_ENDPOINT'},'secret-error')
usage.record({feature:'balance-display',network:'base',operation:'eth_call'},'cache-hit')
usage.record({provider:'alchemy',network:'solana',operation:'batch',count:10},'success',12)
now+=1000;const report=usage.flush();assert.equal(report.rows.reduce((n,r)=>n+r.count,0),15);assert.equal(report.rows.find(r=>r.operation==='batch').requests,1);assert.equal(report.rows.find(r=>r.outcome==='cache-hit').requests,0)
const json=JSON.stringify(report);for(const secret of ['SECRET','PRIVATE','API_KEY','secret url','https://','wallets/'])assert.ok(!json.includes(secret),secret)
assert.equal(usage.flush().rows.length,0);assert.equal(reports.length,1)
// Feature context stays isolated across concurrent async operations.
let release;const gate=new Promise(r=>release=r)
const first=withProviderFeature('wallet-activity',()=>usage.observe({provider:'alchemy',network:'base',operation:'eth_getLogs'},async()=>{await gate;return 1}))
await withProviderFeature('balance-display',()=>usage.observe({provider:'circle',operation:'wallet-balances'},async()=>2));release();await first
assert.deepEqual(usage.flush().rows.map(r=>r.feature).sort(),['balance-display','wallet-activity'])
const broken=createProviderUsage(()=>now,()=>{throw Error('logger down')});assert.equal(await broken.observe({},async()=>result),result);assert.doesNotThrow(()=>broken.flush())
for(let i=0;i<2000;i++)usage.record({operation:'secret-'+i},'success');assert.equal(usage.flush().rows.length,1)
assert.equal(providerErrorOutcome({name:'TimeoutError'}),'timeout');assert.equal(providerErrorOutcome({name:'AbortError'}),'aborted');assert.equal(providerErrorOutcome({reason:'rpc'}),'rpc-error')
assert.equal(circleUsageOperation('/v1/w3s/wallets/PRIVATE/balances?pageAfter=SECRET'),'wallet-balances');assert.equal(circleUsageOperation('/v1/w3s/user/transactions/PRIVATE'),'transaction-read');assert.equal(circleUsageOperation('/v1/w3s/user/transactions/contractExecution','POST'),'transaction-create')
// Transparent fetch: no clones, retries, body consumption or changed failures.
const response=new Response('{"result":1}',{status:200});let calls=0
const init={method:'POST',body:'{"jsonrpc":"2.0","method":"eth_call","params":["SECRET"]}',signal:new AbortController().signal}
const tracked=providerRpcFetch('xlayer-discovery','xlayer',async(input,options)=>{calls++;assert.equal(options,init);return response})
assert.equal(await tracked('https://xlayer-mainnet.g.alchemy.com/v2/SECRET',init),response);assert.equal(response.bodyUsed,false);assert.equal(calls,1)
assert.deepEqual(await response.json(),{result:1})
const failure=Error('secret');await assert.rejects(()=>providerUsageFetch({provider:'circle'},async()=>{throw failure})('https://api.circle.com'),e=>e===failure)
const response429=new Response('',{status:429});assert.equal(await providerUsageFetch({},async()=>response429)('https://web3.okx.com'),response429)
const events=providerUsage.flush();assert.ok(events.rows.some(r=>r.operation==='eth_call'&&r.outcome==='http-ok'));assert.ok(events.rows.some(r=>r.outcome==='rate-limited'));assert.ok(!JSON.stringify(events).includes('SECRET'))
console.log('PASS provider attribution, closed labels, error identity, async isolation, cache/batch accounting, logger failure and transparent HTTP bodies')

const bounded=createProviderUsage(()=>now,()=>{})
for(const feature of ['rpc-read','wallet-activity','balance-display','billing-audit','xlayer-discovery','circle-wallet','okx-history'])for(const network of ['base','arbitrum','arc','ethereum','polygon','solana','bsc','xlayer'])for(const operation of ['eth_chainId','eth_blockNumber','eth_getLogs','eth_call','getTransaction'])bounded.record({feature,network,operation,provider:'alchemy'},'success')
const boundedReport=bounded.flush();assert.equal(boundedReport.rows.length,256);assert.equal(boundedReport.overflow,24)
console.log('PASS bounded metric cardinality with explicit overflow accounting')
import {createReadService} from '../api/evm-read.ts'
process.env.PRIVATE_RPC_URL='https://base-mainnet.g.alchemy.com/v2/SECRET'
let rpcCalls=0
const rpcRead=createReadService(async url=>{rpcCalls++;return url.includes('alchemy.com')?new Response('',{status:429}):new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:'0x123'}),{status:200})})
assert.equal(await withProviderFeature('wallet-activity',()=>rpcRead('base','eth_blockNumber',[])),'0x123')
assert.equal(await withProviderFeature('wallet-activity',()=>rpcRead('base','eth_blockNumber',[])),'0x123');assert.equal(rpcCalls,2)
const rpcReport=providerUsage.flush()
assert.ok(rpcReport.rows.some(r=>r.provider==='alchemy'&&r.outcome==='rate-limited'&&r.feature==='wallet-activity'))
assert.ok(rpcReport.rows.some(r=>r.provider==='public-rpc'&&r.outcome==='success'))
assert.ok(rpcReport.rows.some(r=>r.provider==='none'&&r.outcome==='cache-hit'&&r.requests===0))
console.log('PASS actual EVM fallback/cache attribution without additional provider calls')
