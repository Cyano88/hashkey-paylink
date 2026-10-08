import assert from 'node:assert/strict'
import {fetchCircleStablecoinBalances,createCircleDisplayBalanceReader,circleBalanceTokens} from '../api/pocket/circle-display-balances.ts'
import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
import {mergePocketBalance} from '../src/pocket/lib/pocketBalanceCache.ts'
import {pocketBalanceRevision} from '../src/pocket/lib/pocketBalanceRevision.ts'
import {createPocketBalancesHandler} from '../api/pocket/balances.ts'
import {isPocketBalancesReadData} from '../src/pocket/lib/pocketSchemas.ts'
process.env.CIRCLE_API_KEY='LIVE_API:fixture'
const address='0x'+'a'.repeat(40)
const link={privyUserId:'fixture',chain:'base',purpose:'payment',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'BASE',updatedAt:1}
let requests=0,wrong=false,incomplete=false
const fetcher=async url=>{
 requests++
 if(!url.includes('/balances?'))return Response.json({data:{wallet:{id:'wallet',address,blockchain:'BASE'}}})
 const tokenAddress=new URL(url).searchParams.get('tokenAddress')
 assert.ok([circleBalanceTokens.base[1],POCKET_USDT_ASSETS.base.address].includes(tokenAddress))
 const usdt=tokenAddress===POCKET_USDT_ASSETS.base.address
 return Response.json({data:{tokenBalances:[{amount:usdt?'9.961945':'2.012425',token:{tokenAddress:usdt&&wrong?address:tokenAddress,blockchain:'BASE',decimals:6,isNative:false}}]}},{headers:usdt&&incomplete?{link:'<https://api.circle.com/next>; rel="next"'}:{}})
}
assert.deepEqual(await fetchCircleStablecoinBalances(link,fetcher),{balance:2.012425,usdt:9.961945})
assert.equal(requests,3,'one wallet verification and two filtered Circle token reads')
wrong=true;assert.equal((await fetchCircleStablecoinBalances(link,fetcher)).usdt,undefined);wrong=false
incomplete=true;assert.equal((await fetchCircleStablecoinBalances(link,fetcher)).usdt,undefined);incomplete=false
let providerCalls=0,rpcCalls=0,clock=10000
const reader=createCircleDisplayBalanceReader(async()=>{providerCalls++;return {balance:2.012425,usdt:9.961945}},()=>clock,false)
const fallback=async()=>{rpcCalls++;return 0}
await Promise.all([reader(link,fallback),reader(link,fallback)])
assert.equal(providerCalls,1);assert.equal(rpcCalls,0)
await reader(link,fallback,true);assert.equal(providerCalls,2);assert.equal(rpcCalls,0,'manual display refresh stays on Circle')
const handler=createPocketBalancesHandler({verifyUser:async()=>({userId:'fixture'}),readLink:async key=>key==='fixture:base'?link:null,readBalance:fallback,readDisplayBalance:reader})
let body
await handler({method:'GET',query:{}},{setHeader(){},json(v){body=v},status(){return this}})
assert.equal(isPocketBalancesReadData(body),true)
assert.equal(body.rows[0].usdt,9.961945)
const wallets={base:{address,walletId:'wallet',updatedAt:1}}
const first=await mergePocketBalance(undefined,wallets,body)
assert.equal(first.displayRows[0].usdt,9.961945)
const retained=await mergePocketBalance(first,wallets)
assert.equal(retained.displayRows[0].usdt,9.961945);assert.equal(retained.displayRows[0].usdtStale,true)
const replaced=await mergePocketBalance(first,{base:{...wallets.base,address:'0x'+'b'.repeat(40)}},body)
assert.equal(replaced.displayRows[0].usdt,undefined,'never retain a different wallet balance')
body.rows[0].usdt=0
assert.equal((await mergePocketBalance(first,wallets,body)).displayRows[0].usdt,0)
body.rows[0].usdt=-1;assert.equal(isPocketBalancesReadData(body),false)
console.log('PASS: Circle USDC/USDT reads, no routine or manual display RPC, shared cache, strict token binding, incomplete response, zero and wallet replacement.')
process.exit(0)
