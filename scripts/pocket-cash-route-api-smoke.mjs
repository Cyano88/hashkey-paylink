import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve,sep} from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'pocket-cash-route-'))
if(!resolve(dir).startsWith(resolve(tmpdir())+sep))throw Error('Invalid fixture directory')
for(const key of ['DATABASE_URL','RENDER','RENDER_SERVICE_ID','RENDER_EXTERNAL_URL'])delete process.env[key]
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'journal.json')
process.env.POCKET_SWAP_QUOTE_SECRET='cash-route-fixture-secret-'.repeat(3)
try{
 const {cashFixture,owner,wallet,rate}=await import('./fixtures/cash-conversion.mjs')
 const {q,now}=await cashFixture()
 const {createCashConversionHandler}=await import('../api/pocket/cash-conversion.ts')
 const {recordCirclePocketAction:record,findCirclePocketAction:find}=await import('../api/circle-pocket-action-journal.ts')
 const rail=process.env.CASH_TEST_RAIL||'evm',external=['bsc','xlayer'].includes(rail)
 const prefix=rail==='bsc'?'pocket:bsc-outbound-bridge:':rail==='xlayer'?'pocket:xlayer-bridge:':rail==='solana'?'pocket:solana-usdt-bridge:':'pocket:usdt-bridge:'
 const bridgeAction=rail==='bsc'?'wallet.bsc-bridge':rail==='xlayer'?'wallet.xlayer-bridge':'wallet.usdt-bridge'
 const bridgeId='11111111-2222-4333-8444-555555555555',ref=rail+':'+bridgeId,hash='0x'+'2'.repeat(64)
 let writes=0,quoteCount=0
 const metadata={source:external?rail:rail==='solana'?'solana':'arbitrum',purpose:'cash',assetSymbol:'USDT',...(external?{cashReceivedAmount:'10'}:{}),destination:'base',destinationAddress:wallet,destinationTxHash:hash,settledAmountUnits:'10000000'}
 const bridge={ownerId:owner,action:bridgeAction,idempotencyKey:prefix+bridgeId,status:'completed',metadata}
 await record(bridge)
 const d={multichain:()=>true,identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'base',purpose:'payment',circleBlockchain:'BASE',circleWalletId:'wallet',circleWalletAddress:wallet}),enabled:()=>true,now:()=>now,approval:async()=>true,rate:async()=>rate,estimate:async()=> '0.00001',quote:async b=>({...q,...b,id:('00000000'+(++quoteCount)).slice(-8)+'-2222-4333-8444-555555555555'}),rpc:async(_n,m)=>m==='eth_chainId'?'0x2105':'0x10000000',challenge:async()=>{writes++;return{challengeId:'challenge'}}}
 const handler=createCashConversionHandler(d)
 async function call(body,query={},method='POST',target=handler){let status=200,data;await target({method,body,query,headers:{}},{setHeader(){},status(s){status=s;return this},json(v){data=v;return this}});return{status,data}}
 const request={action:'quote',network:'base',from:'USDT',to:'USDC',amount:'10',fundingBridge:ref}
 for(const bad of [{status:'submitted'},{metadata:{...metadata,destination:'arbitrum'}},{metadata:{...metadata,destinationAddress:'0x'+'3'.repeat(40)}},{metadata:{...metadata,settledAmountUnits:undefined,cashReceivedAmount:undefined}}]){
  const invalid=createCashConversionHandler({...d,find:async()=>({...bridge,...bad})});assert.equal((await call(request,{},'POST',invalid)).status,409);assert.equal(writes,0)
 }
 if(external)for(const patch of [{assetSymbol:'USDC'},{purpose:undefined},{source:'solana'},{cashReceivedAmount:'10.0000001'}]){const invalid=createCashConversionHandler({...d,find:async()=>({...bridge,metadata:{...metadata,...patch}})});assert.equal((await call(request,{},'POST',invalid)).status,409)}
 await record(bridge)
 assert.equal((await call({...request,amount:'9'})).status,409,'only exact verified delivery is eligible')
 const a=await call(request),b=await call(request);assert.equal(a.status,200);assert.equal(b.status,200)
 const out=await Promise.all([a,b].map(x=>call({action:'execute',quoteToken:x.data.quoteToken})))
 assert.deepEqual(out.map(x=>x.status).sort(),[200,409]);assert.equal(writes,1,'atomic dedupe blocks a second quote/device')
 const saved=(await call({}, {fundingBridge:ref},'GET')).data.pending[0]
 assert.ok(saved);assert.equal(saved.challengeId,'challenge')
 const id=saved.quote.id,old=await find(owner,'pocket:cash-conversion:'+id,'wallet.cash-conversion')
 await record({...old,status:'completed',metadata:{...old.metadata,amountOut:'9.97',txHash:hash}})
 const late=await record({...old,status:'submitted'});assert.equal(late.status,'completed','late provider response cannot reopen a completed conversion')
 const paused=createCashConversionHandler({...d,enabled:()=>false,multichain:()=>false})
 assert.equal((await call({}, {fundingBridge:ref},'GET',paused)).data.pending[0].status,'completed','rollout rollback retains completed recovery')
 assert.equal((await call(request,{},'POST',paused)).status,409)
 const c=await call(request);assert.equal((await call({action:'execute',quoteToken:c.data.quoteToken})).status,409);assert.equal(writes,1,'completed delivery cannot fund another conversion')
 assert.equal((await call({}, {fundingBridge:ref},'GET')).data.pending[0].status,'completed','crash after completion can restore result')
 const other=createCashConversionHandler({...d,identity:async()=>({userId:'other'}),readLink:async()=>({...await d.readLink(),privyUserId:'other'})})
 assert.equal((await call(request,{},'POST',other)).status,409,'bridge ownership is isolated')
 const secondId='99999999-2222-4333-8444-555555555555',secondRef=rail+':'+secondId
 await record({...bridge,idempotencyKey:prefix+secondId})
 const secondRequest={...request,fundingBridge:secondRef},firstTry=await call(secondRequest)
 await call({action:'execute',quoteToken:firstTry.data.quoteToken})
 const failed=(await call({}, {fundingBridge:secondRef},'GET')).data.pending[0]
 const failedRecord=await find(owner,'pocket:cash-conversion:'+failed.quote.id,'wallet.cash-conversion')
 await record({...failedRecord,status:'failed'})
 const retry=await call(secondRequest);assert.equal((await call({action:'execute',quoteToken:retry.data.quoteToken})).status,200,'proven failed conversion can retry without another bridge')
 assert.equal(writes,3)
 console.log('PASS '+rail+' linked Cash conversion: exact settled output, wallet/owner/destination binding, atomic parallel claims, completed replay prevention, restored success and failed-conversion-only retry.')
}finally{await rm(dir,{recursive:true,force:true})}
