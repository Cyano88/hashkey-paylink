import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
process.env.POCKET_PIN_PEPPER='synthetic-pin-migration-test-only';
const source=await readFile('api/pocket/payment-security.ts','utf8');
const fixture=`\nexport async function seedLegacyFixture(owner,pin){const record=await newPinRecord(pin,1000,size=>Buffer.alloc(size,8));delete record.pinLength;localStore.set(ownerKey(owner),record)}`;
const bundle=await build({stdin:{contents:source+fixture,loader:'ts',resolveDir:process.cwd()+'/api/pocket'},bundle:true,write:false,platform:'node',format:'esm',plugins:[{name:'isolated-stores',setup(b){b.onResolve({filter:/privy-circle-link|render-durable-store/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('privy')?'export const verifiedPrivyUser=()=>{throw Error("No production identity calls")};':'export const hasRenderDurableStore=()=>false;export const deleteDurableJson=()=>{};export const mutateDurableJson=()=>{};export const readDurableJson=()=>{};export const writeDurableJson=()=>{};'}))}}]});
const {createPocketPaymentSecurityHandler,seedLegacyFixture}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
let now=100000;let owner='legacy-fixture';let count=10;
const handler=createPocketPaymentSecurityHandler({verifyUser:async()=>({userId:owner}),now:()=>now,random:size=>Buffer.alloc(size,++count)});
async function call(method,body={}){let code=200,data;await handler({method,body,headers:{}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this}});return {code,data}}
await seedLegacyFixture(owner,'123456');assert.equal((await call('GET')).data.pinLength,6);
assert.equal((await call('POST',{action:'verify',pin:'1234'})).code,401,'Never truncate an old PIN');assert.equal((await call('POST',{action:'verify',pin:'123456'})).code,200);
assert.equal((await call('POST',{action:'change',currentPin:'123456',newPin:'4321'})).code,200);assert.equal((await call('GET')).data.pinLength,4);assert.equal((await call('POST',{action:'verify',pin:'123456'})).code,401);assert.equal((await call('POST',{action:'verify',pin:'4321'})).code,200);
for(let i=0;i<5;i++)assert.equal((await call('POST',{action:'verify',pin:'9999'})).code,401);assert.equal((await call('POST',{action:'verify',pin:'4321'})).code,429);now+=31000;assert.equal((await call('POST',{action:'verify',pin:'4321'})).code,200);
owner='new-fixture';assert.equal((await call('POST',{action:'setup',pin:'123456'})).code,400);assert.equal((await call('POST',{action:'setup',pin:'1234'})).code,200);
console.log('PASS legacy 6-digit verification without truncation, authenticated migration to 4, new setup policy, wrong PIN rejection and lockout. Isolated synthetic store.');
