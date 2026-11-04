import assert from 'node:assert/strict'
import {fetchCircleTokenUnits,createCircleTokenDisplayReader} from '../api/pocket/circle-token-display.ts'
import {createPocketBalancesHandler} from '../api/pocket/balances.ts'
const address='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222'
const link={privyUserId:'owner',chain:'arc',purpose:'payment',circleWalletId:'wallet',circleWalletAddress:address,circleBlockchain:'ARC',updatedAt:1},token={address:'0x3600000000000000000000000000000000000001',decimals:6}
process.env.CIRCLE_API_KEY='LIVE_API:fixture'
let wallet={id:'wallet',address,blockchain:'ARC'},rows=[{amount:'123.456789',token:{blockchain:'ARC',tokenAddress:token.address,decimals:6,isNative:false}}],next=false
const fetcher=async url=>new Response(JSON.stringify({data:url.includes('/balances?')?{tokenBalances:rows}:{wallet}}),{headers:next?{link:'<https://api.circle.com/next>; rel="next"'}:{}})
assert.equal(await fetchCircleTokenUnits(link,token,fetcher),123456789n)
const good=structuredClone(rows)
for(const bad of [{amount:'1.1234567'}, {token:{...good[0].token,decimals:18}}, {token:{...good[0].token,blockchain:'BASE'}}, {token:{...good[0].token,tokenAddress:other}}, {token:{...good[0].token,isNative:true}}]){rows=[{...good[0],...bad}];await assert.rejects(fetchCircleTokenUnits(link,token,fetcher))}
rows=good;wallet={...wallet,address:other};await assert.rejects(fetchCircleTokenUnits(link,token,fetcher));wallet.address=address
next=true;await assert.rejects(fetchCircleTokenUnits(link,token,fetcher));next=false
rows=[];assert.equal(await fetchCircleTokenUnits(link,token,fetcher),0n)
let now=100000,circle=0,rpc=0,down=false
const reader=createCircleTokenDisplayReader(async()=>{circle++;if(down)throw Error('offline');return 42n},()=>now),fallback=async()=>{rpc++;return 43n}
assert.deepEqual(await Promise.all([reader(link,token,fallback),reader(link,token,fallback)]),[42n,42n]);assert.equal(circle,1);assert.equal(rpc,0)
await reader(link,token,fallback,true);assert.equal(circle,2);assert.equal(rpc,0,'refresh remains Circle first')
await reader({...link,privyUserId:'different'},token,fallback);assert.equal(circle,3)
now+=31000;down=true;assert.equal(await reader(link,token,fallback),43n);assert.equal(rpc,1)
now+=31000;await reader(link,token,fallback);assert.equal(circle,4);assert.equal(rpc,2)
now+=31000;down=false;assert.equal(await reader(link,token,fallback),42n)
const broken=createCircleTokenDisplayReader(async()=>{throw Error('circle')});await assert.rejects(broken(link,token,async()=>{throw Error('rpc')}),'unknown must not become zero')
let primary=0,direct=0
const handler=createPocketBalancesHandler({verifyUser:async()=>({userId:'owner'}),readLink:async()=>link,readBalance:async()=>{direct++;return 8},readDisplayBalance:async(_l,f,fresh)=>{primary++;assert.equal(fresh,true);return {balance:7,observedAt:now,source:'circle'}}})
const res={setHeader(){},status(n){this.code=n;return this},json(body){this.body=body;return this}}
await handler({method:'GET',query:{network:'arc',refresh:'1'}},res);assert.equal(res.body.balance,7);assert.equal(primary,1);assert.equal(direct,0)
console.log('PASS Circle-first token display, exact precision, wallet binding, cache isolation, refresh, RPC fallback and network endpoint')
