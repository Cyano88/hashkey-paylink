import assert from 'node:assert/strict'
import {fetchCircleNativeBalance,createNativeBalanceReader} from '../api/pocket/native-balances.ts'
import {POCKET_NATIVE_ASSETS,pocketAssetActionAllowed} from '../src/pocket/lib/pocketNativeAssets.ts'
const owner='owner',address='0x'+'1'.repeat(40)
const link={privyUserId:owner,chain:'ethereum',purpose:'payment',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'ETH',updatedAt:1}
process.env.CIRCLE_API_KEY='LIVE_fixture'
process.env.OKX_DEX_API_KEY='fixture';process.env.OKX_DEX_SECRET_KEY='fixture';process.env.OKX_DEX_PASSPHRASE='fixture'
let rows=[{token:{id:'native',blockchain:'ETH',symbol:'ETH',isNative:true,decimals:18},amount:'0.012345678901234567'}],walletAddress=address,paged=false
const fetcher=async url=>new Response(JSON.stringify({data:url.includes('/balances?')?{tokenBalances:rows}:{wallet:{id:'wallet',address:walletAddress,blockchain:'ETH'}}}),{headers:{...(paged&&url.includes('/balances?')?{link:'<next>; rel="next"'}:{})}})
assert.equal(await fetchCircleNativeBalance(link,fetcher),Number(rows[0].amount))
walletAddress='0x'+'2'.repeat(40);await assert.rejects(fetchCircleNativeBalance(link,fetcher),/binding/);walletAddress=address
for(const change of [{symbol:'FAKE'},{decimals:6},{blockchain:'BASE'}]){const saved=rows[0].token;rows[0].token={...saved,...change};await assert.rejects(fetchCircleNativeBalance(link,fetcher));rows[0].token=saved}
rows.push(structuredClone(rows[0]));await assert.rejects(fetchCircleNativeBalance(link,fetcher));rows.pop()
const oldAmount=rows[0].amount;rows[0].amount='1e18';await assert.rejects(fetchCircleNativeBalance(link,fetcher));rows[0].amount=oldAmount
paged=true;await assert.rejects(fetchCircleNativeBalance(link,fetcher),/Incomplete|Invalid/);paged=false
rows=[];assert.equal(await fetchCircleNativeBalance(link,fetcher),0)
let calls=0,now=1000000
const prices=async(url,init)=>{assert.equal(url,'https://web3.okx.com/api/v6/dex/market/price');assert.equal(init.method,'POST');return new Response(JSON.stringify({code:'0',data:JSON.parse(init.body).map(p=>({...p,price:p.chainIndex==='1'?'2000':p.chainIndex==='137'?'1':'100',time:String(now)}))}))}
const read=createNativeBalanceReader(async()=>{calls++;return 2},prices,()=>now)
const links=async key=>key.includes('ethereum')?link:null
const first=await read(owner,links);assert.equal(first[0].valueUsd,4000);assert.equal(first[0].quantity,2);assert.equal(calls,1)
await read(owner,links);assert.equal(calls,1,'display balances cached')
const wrong=await read('other-owner',links);assert.equal(wrong[0].quantity,null);assert.equal(calls,1,'wrong owner never queried')
now+=31000;await read(owner,links);assert.equal(calls,2)
const failure=createNativeBalanceReader(async()=>{throw Error('offline')},prices,()=>now)
const unavailable=await failure(owner,links);assert.equal(unavailable[0].quantity,null,'failure is not zero');assert.equal(unavailable[1].quantity,0,'uncreated wallet is zero')
for(const [symbol,asset] of Object.entries(POCKET_NATIVE_ASSETS))for(const network of asset.networks){assert.equal(pocketAssetActionAllowed(symbol,network,'payment'),false);assert.equal(pocketAssetActionAllowed(symbol,network,'bridge'),false);assert.equal(pocketAssetActionAllowed(symbol,network,'deposit'),true)}
assert.equal(pocketAssetActionAllowed('OKB','xlayer','stock'),true)
assert.equal(pocketAssetActionAllowed('ETH','xlayer','deposit'),false)
assert.equal(pocketAssetActionAllowed('BNB','bnb','deposit'),false)
console.log('PASS native ownership, native/token identity, decimals, pagination, pricing, cache isolation, unknown balances, stablecoin-only payment/bridge policy, and OKB stock exception')

for(const data of [[{chainIndex:'137',tokenContractAddress:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',price:'2000',time:String(now)}],[{chainIndex:'1',tokenContractAddress:'0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',price:'2000',time:String(now-60001)}]]){const reader=createNativeBalanceReader(async()=>2,async()=>new Response(JSON.stringify({code:'0',data})),()=>now);const result=await reader(owner,links);assert.equal(result[0].quantity,2);assert.equal(result[0].valueUsd,null)}
console.log('PASS native prices reject wrong chain and stale data while preserving holdings')
