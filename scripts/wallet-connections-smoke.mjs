import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createWalletConnectionHandlers} from '../api/wallet-connections.ts';
import {cliRequestScope} from '../api/developer-cli-grants.ts';
const hash=s=>createHash('sha256').update(s).digest('hex'), verifier='a'.repeat(43), store=new Map();
let now=1000,project='project-a',app='hpl-app',email='user@example.com',user='did:privy:user',verified=100,failWrite=false;
const handlers=createWalletConnectionHandlers({
 hasStore:()=>true,now:()=>now,appId:()=>app,
 policy:async()=>({partnerId:project,merchantName:'Fixture App',environment:'live',checkoutMode:'human',capabilities:['arc_agreements']}),
 identity:async()=>({userId:user,email,emailVerifiedAt:verified}),
 read:async key=>structuredClone(store.get(key)),
 mutate:async(key,update)=>{if(failWrite)throw Error('Private storage failure');const result=update(structuredClone(store.get(key)));store.set(key,structuredClone(result));return result;},
});
async function call(fn,body,headers={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this;},json(b){this.body=b;return this;}};await fn({method:'POST',headers,body,query:{}},res);return res;}
const create=()=>call(handlers.developer,{action:'create',subject:'hps-user-1',email:'user@example.com',challenge:hash(verifier),projectName:'Spoofed project'});
let r=await create();assert.equal(r.statusCode,201);assert.equal(r.body.projectName,'Fixture App');const id=r.body.id,access=new URL('https://example.com'+r.body.connectPath).hash.slice(8);
assert.equal(access.length,43);assert.ok(!JSON.stringify([...store.values()]).includes(access));assert.ok(!JSON.stringify([...store.values()]).includes(email));
const participant=(action='read',extra={})=>call(handlers.participant,{id,access,action,...extra});
const redeem=(proof=verifier)=>call(handlers.developer,{id,action:'redeem',verifier:proof});
assert.equal((await redeem()).statusCode,409);
assert.equal((await participant('read',{access:'b'.repeat(43)})).statusCode,404);
email='intruder@example.com';assert.equal((await participant('approve')).statusCode,403);email='user@example.com';
verified=undefined;assert.equal((await participant('approve')).statusCode,403);verified=100;
assert.equal((await participant()).body.projectName,'Fixture App');
assert.equal((await participant('approve')).body.approved,true);
assert.equal((await redeem('b'.repeat(43))).statusCode,404);
project='project-b';assert.equal((await redeem()).statusCode,404);project='project-a';
r=await redeem();assert.equal(r.body.projectName,'Fixture App');assert.equal(r.body.hashPayLinkUserId,'did:privy:user');assert.equal(r.body.subject,'hps-user-1');
assert.deepEqual((await redeem()).body,r.body,'Retry-safe redemption never changes identity');
user='did:privy:other';assert.equal((await participant('approve')).statusCode,409);user='did:privy:user';
assert.equal((await call(handlers.participant,{id,access,action:'read'},{'x-api-key':'fixture'})).statusCode,401);
app='changed-app';assert.equal((await redeem()).statusCode,409);app='hpl-app';
failWrite=true;assert.equal((await create()).statusCode,500);assert.ok(!(await create()).body.error.includes('Private'));failWrite=false;
now=601000;assert.equal((await redeem()).statusCode,404);assert.equal((await participant()).statusCode,404);
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallet-connections',body:{action:'create'}}),'wallet:connect');
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallet-connections/participant',body:{action:'approve'}}),null);
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallet-connections',body:{action:'sign'}}),null);
console.log('Wallet connection tests passed: project isolation, verified identity, consent, proof, expiry, immutable replay, app binding, secret hashing, fail-closed storage and scopes.');
