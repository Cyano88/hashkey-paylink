import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createXStocksAgreementHandlers} from '../api/xstocks-agreement/http.ts';
import {cliRequestScope} from '../api/developer-cli-grants.ts';
const stock=JSON.parse(readFileSync('src/lib/xstocksAgreement/xStocksCatalog.json','utf8')).assets[0];
const buyer='0x'+'11'.repeat(20),seller='0x'+'22'.repeat(20),store=new Map();
let who='did:privy:customer',project='project-one',enabled=true,projectEnabled=true,capability=true,failWrite=false,walletOverride,state=1,block='10',lastPlan;
const handlers=createXStocksAgreementHandlers({
 env:()=>({HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:enabled?'true':'false',HASHPAYLINK_AGREEMENT_XSTOCKS_ASSETS_JSON:JSON.stringify([{address:stock.address,decimals:18}])}),
 assets:async()=>({enabled,assets:enabled?[stock]:[]}),
 hasStore:()=>true,now:()=>new Date('2026-09-24T12:00:00Z'),
 policy:async()=>({partnerId:project,environment:'live',checkoutMode:'human',capabilities:capability?['xstocks_agreements']:['arc_agreements']}),
 projectEnabled:async()=>projectEnabled,
 identity:async req=>{if(req.headers['x-api-key'])throw Object.assign(Error('Sign in'),{status:401});return who;},
 wallet:async()=>({address:walletOverride||(who==='did:privy:customer'?buyer:seller),chainId:196}),
 read:async key=>structuredClone(store.get(key)),
 mutate:async(key,update)=>{if(failWrite)throw Error('Storage unavailable');const next=update(structuredClone(store.get(key)));store.set(key,structuredClone(next));return next;},
 plan:async input=>{lastPlan=input;return {enabled:true,observedBlock:block,state,escrow:'0x'+'44'.repeat(20),actions:['refund'],...(input.action?{transaction:{account:input.account,to:'0x'+'44'.repeat(20),data:'0x1234',chainId:196,value:'0'}}:{})};},
});
async function call(handler,body={},method='POST',headers={},query={}){const res={statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(body){this.body=body;return this;}};await handler({method,headers,query,body},res);return res;}
const draft={title:'Design work',description:'Deliver the agreed design and source files.',amount:'0.125',durationSeconds:86400,paymentToken:stock.address,reviewHours:48,customerUserId:'did:privy:customer',providerUserId:'did:privy:provider'};
const headers={'idempotency-key':'xstocks_draft_fixture_0001'},create=(body=draft)=>call(handlers.developer,body,'POST',headers);
assert.equal((await call(handlers.developer,{},'GET',{}, {purpose:'assets'})).body.assets[0].address,stock.address);
assert.equal((await create({...draft,environment:'test'})).statusCode,409);
assert.equal((await create({...draft,paymentRail:'arc'})).statusCode,400);
assert.equal((await create({...draft,action:'fund'})).statusCode,400);
capability=false;assert.equal((await create()).statusCode,403);capability=true;
let result=await create();assert.equal(result.statusCode,201);
const agreement=result.body.agreement,agreementId=agreement.id,consentHash=agreement.consentHash;
assert.equal((await create()).body.agreement.id,agreementId);assert.equal(store.size,1);
assert.equal((await create({...draft,amount:'0.25'})).statusCode,409);
project='project-two';assert.equal((await call(handlers.developer,{},'GET',{}, {id:agreementId})).statusCode,404);
assert.notEqual((await create()).body.agreement.id,agreementId,'Project namespace prevents collisions');project='project-one';
const participant=(action,extra={})=>call(handlers.participant,{agreementId,action,...extra});
who='did:privy:outsider';assert.equal((await participant('read')).statusCode,404);who='did:privy:customer';
assert.equal((await participant('prepare')).statusCode,409);
assert.equal((await participant('accept_terms',{address:buyer,consentHash:'wrong'})).statusCode,409);
assert.equal((await participant('accept_terms',{address:buyer,consentHash})).statusCode,200);
walletOverride=seller;assert.equal((await participant('accept_terms',{address:seller,consentHash})).statusCode,409);walletOverride=undefined;
who='did:privy:provider';result=await participant('accept_terms',{address:seller,consentHash});assert.equal(result.statusCode,200);
const binding=result.body.agreement.binding;assert.equal(binding.contractTerms.amount,'125000000000000000');
assert.deepEqual((await participant('accept_terms',{address:seller,consentHash})).body.agreement.binding,binding);
assert.equal((await participant('prepare',{operation:'toString'})).statusCode,400);
state=3;block='20';result=await participant('prepare',{operation:'dispatch',evidence:'https://example.com/work'});
assert.equal(result.statusCode,200);assert.ok(result.body.status.transaction);assert.equal(lastPlan.account,seller);assert.equal(result.body.agreement.evidence.length,1);
assert.equal((await participant('prepare',{operation:'dispatch',evidence:'https://example.com/work'})).body.agreement.evidence.length,1);
failWrite=true;assert.equal((await participant('prepare',{operation:'dispatch',evidence:'Different delivery evidence'})).statusCode,500);failWrite=false;
block='10';state=1;assert.equal((await participant('prepare')).statusCode,409);assert.equal((await participant('read')).body.agreement.observed.state,3);
block='21';state=undefined;assert.equal((await participant('prepare',{operation:'create'})).statusCode,409,'Cannot recreate a previously observed escrow');
block='21';state=3;enabled=false;
assert.equal((await create()).statusCode,409);assert.equal((await participant('prepare',{operation:'fund'})).statusCode,409);
assert.equal((await participant('prepare',{operation:'refund',evidence:'Returning the stock payment'})).statusCode,200);
enabled=true;projectEnabled=false;assert.equal((await participant('prepare',{operation:'create'})).statusCode,409);
assert.equal((await participant('prepare',{operation:'refund',evidence:'Returning the stock payment'})).statusCode,200);
assert.equal((await call(handlers.participant,{agreementId,action:'prepare'},'POST',{'x-api-key':'fixture'})).statusCode,401);
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/xstocks-agreements',body:draft}),'xstocks-agreement:create');
assert.equal(cliRequestScope({method:'GET',originalUrl:'/api/v2/xstocks-agreements?id='+agreementId}),'xstocks-agreement:read');
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/xstocks-agreements/participant',body:{action:'prepare'}}),null);
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/xstocks-agreements',body:{action:'fund'}}),null);
console.log('xStocks API passed: project isolation, exact consent, immutable wallets, idempotency, durable evidence, monotonic state, paused recovery and separate scopes.');
