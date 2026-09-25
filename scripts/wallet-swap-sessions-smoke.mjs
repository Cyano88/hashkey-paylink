import assert from 'node:assert/strict'
import {createWalletSwapSessionHandlers} from '../api/wallet-swap-sessions.ts'
import {cliRequestScope} from '../api/developer-cli-grants.ts'
let capabilities=['swap_arc','swap_xlayer'];
const store=new Map();let who='did:privy:user',project='project-a',enabled=true,projectEnabled=true,dispatches=[],appId='fixture-app-id'
const env=()=>({PRIVY_APP_ID:appId,PRIVY_APP_SECRET:'fixture-only',HASHPAYLINK_WALLET_SWAP_ENABLED:enabled?'true':'false',HASHPAYLINK_WALLET_SWAP_PROJECTS:'project-a,project-b'})
const h=createWalletSwapSessionHandlers({env,hasStore:()=>true,policy:async()=>({partnerId:project,merchantName:'Fixture',environment:'live',checkoutMode:'human',capabilities}),projectEnabled:async()=>projectEnabled,identity:async()=>({userId:who}),read:async k=>structuredClone(store.get(k)),mutate:async(k,fn)=>{const r=await fn(structuredClone(store.get(k)));store.set(k,structuredClone(r));return r},dispatch:async(r,req,res)=>{dispatches.push({record:r,method:req.method,body:req.body,query:req.query});return res.json({ok:true,owner:r.userId})}})
async function call(handler,body,headers={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(b){this.body=b;return this}};await handler({method:'POST',headers:{'idempotency-key':'wallet_swap_fixture_001',...headers},body},res);return res}
const create=(body={rail:'arc',userId:who})=>call(h.developer,body)
let reply=await create();assert.equal(reply.statusCode,201);const a=reply.body.session
assert.equal(a.chainId,5042);assert.equal((await create()).body.session.id,a.id);assert.equal(store.size,1)
assert.equal((await create({rail:'base',userId:who})).statusCode,400)
assert.equal((await create({rail:'xlayer',userId:who})).statusCode,409,'Retry identity cannot change network')
project='project-b';const b=(await create()).body.session;assert.notEqual(b.id,a.id);project='project-a'
const participant=(action,extra={})=>call(h.participant,{sessionId:a.id,action,...extra})
assert.equal((await participant('read')).body.session.chainId,5042)
who='did:privy:outsider';assert.equal((await participant('read')).statusCode,404);who='did:privy:user'
assert.equal((await call(h.participant,{sessionId:a.id,action:'read'},{'x-api-key':'fixture'})).statusCode,401)
assert.equal((await participant('request',{method:'POST',payload:{action:'quote',tokenIn:'fixture'}})).statusCode,200)
assert.equal(dispatches.at(-1).record.projectId,'project-a');assert.equal(dispatches.at(-1).record.userId,who)
assert.equal((await participant('request',{method:'DELETE'})).statusCode,400)
appId='changed-app-id';assert.equal((await participant('read')).statusCode,409);appId='fixture-app-id'
enabled=false;assert.equal((await create()).statusCode,201,'Existing session remains recoverable')
assert.equal((await participant('request',{method:'POST',payload:{action:'execute'}})).statusCode,409)
assert.equal((await participant('request',{method:'POST',payload:{action:'status',quoteToken:'fixture'}})).statusCode,200)
assert.equal((await participant('request',{method:'GET',token:'fixture-token'})).statusCode,200);assert.deepEqual(dispatches.at(-1).query,{token:'fixture-token'})
enabled=true;projectEnabled=false;assert.equal((await participant('request',{method:'POST',payload:{action:'quote'}})).statusCode,409)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/swap-sessions'}),'wallet:swap')
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/swap-sessions/participant'}),null)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/stocks/balances'}),'wallet:stocks:read')
console.log('Wallet swap sessions passed: exact scope, account/project/rail/authority binding, immutable retries, key rejection on user actions and paused recovery.')

capabilities=['arc_agreements','xstocks_agreements'];assert.equal((await create()).statusCode,403,'Agreement selection alone cannot authorize Swap')
capabilities=['swap_xlayer'];assert.equal((await create()).statusCode,403,'X Layer-only Swap cannot open Arc')
capabilities=['swap_arc'];assert.equal((await create({rail:'xlayer',userId:who})).statusCode,403,'Arc-only Swap cannot open X Layer')
