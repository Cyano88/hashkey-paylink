import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {createXLayerSponsorshipHandler} from '../api/pocket/xlayer-sponsorship.ts'
import {makeSponsoredRequest} from '../src/pocket/lib/pocketSponsoredRequest.ts'
import {preparePocketEarnCall} from '../src/pocket/lib/pocketEarnCalls.ts'

const wallet='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',walletId='fixturewallet12345'
const config={appId:'fixture',secret:'fixture-secret',enabled:true,earnEnabled:true,wallets:[wallet]},now=Date.now(),hash='0x'+'a'.repeat(64)
const intent={action:'deposit',symbol:'USDC',amount:'1'}
function body(change={}){
 const call=preparePocketEarnCall({...intent,...change,owner:wallet})
 return {action:'send',purpose:'earn',intent:{...intent,...change},wallet,signature:'a'.repeat(88),request:makeSponsoredRequest({appId:config.appId,walletId,attemptId:crypto.randomUUID(),expiresAt:now+90000,from:wallet,to:call.to,data:call.data})}
}
function fixture(options={}){
 let store,calls=0,preflights=0,queue=Promise.resolve()
 const handler=createXLayerSponsorshipHandler({identity:async()=>({userId:'owner'}),user:async()=>({linkedAccounts:[{type:'wallet',walletClientType:'privy',chainType:'ethereum',address:wallet,id:walletId}]}),config:()=>config,durable:()=>true,now:()=>now,
 read:async()=>structuredClone(store),mutate:fn=>{const next=queue.then(()=>{store=fn(structuredClone(store));return structuredClone(store)});queue=next.catch(()=>{});return next},
 earnPreflight:async()=>{preflights++},minimum:async()=>{throw Error('Earn must not use send pricing')},
 fetch:async()=>{calls++;return Response.json({data:{hash}})},...options})
 return {get calls(){return calls},get preflights(){return preflights},async call(input){const r={status:200};const res={setHeader(){},status(n){r.status=n;return res},json(b){r.body=b;return res}};await handler({method:'POST',body:input},res);return r}}
}
for(const symbol of ['USDC','USDT0'])for(const action of ['approve','deposit','withdraw']){
 const f=fixture(),b=body({symbol,action})
 assert.equal((await f.call(b)).body.hash,hash)
 assert.equal((await f.call(b)).body.hash,hash);assert.equal(f.calls,1);assert.equal(f.preflights,1)
}
const abi=parseAbi(['function approve(address,uint256) returns(bool)','function supply(address,uint256,address,uint16)','function withdraw(address,uint256,address) returns(uint256)'])
for(const edit of [
 b=>delete b.purpose,
 b=>delete b.intent,
 b=>b.intent.amount='2',
 b=>b.intent.symbol='USDT',
 b=>b.intent.action='borrow',
 b=>b.request.body.params.transaction.from=other,
 b=>b.request.body.params.transaction.to=other,
 b=>b.request.body.params.transaction.value='0x1',
 b=>b.request.body.params.transaction.chain_id='0x1',
 b=>b.request.url='https://attacker.invalid',
 b=>b.request.body.params.transaction.data+='00',
 b=>{b.intent.action='approve';b.request.body.params.transaction.to='0xB6CEceAB302E2E4948951eE7843FC24E92933061';b.request.body.params.transaction.data=encodeFunctionData({abi,functionName:'approve',args:[other,1000000n]})},
 b=>{b.intent.action='withdraw';b.request.body.params.transaction.data=encodeFunctionData({abi,functionName:'withdraw',args:['0xB6CEceAB302E2E4948951eE7843FC24E92933061',1000000n,other]})},
 b=>b.request.body.params.transaction.data=encodeFunctionData({abi,functionName:'supply',args:['0xB6CEceAB302E2E4948951eE7843FC24E92933061',1000000n,other,0]}),
 b=>b.request.body.params.transaction.data=encodeFunctionData({abi,functionName:'supply',args:['0xB6CEceAB302E2E4948951eE7843FC24E92933061',1000000n,wallet,1]}),
]){
 const f=fixture(),b=body();edit(b);assert.notEqual((await f.call(b)).status,200);assert.equal(f.calls,0)
}
for(const options of [{config:()=>({...config,earnEnabled:false})},{earnPreflight:async()=>{throw Error('simulation failed')}}]){
 const f=fixture(options);assert.equal((await f.call(body())).body.code,'pocket_sponsor_not_submitted');assert.equal(f.calls,0)
}
const f=fixture(),b=body();await Promise.all([f.call(b),f.call(b)]);assert.equal(f.calls,1,'concurrent retries reserve only one broadcast')
console.log('PASS Earn sponsorship: both assets/actions, exact calls, owner-only recipients, separate gate, simulation rejection and duplicate prevention')
