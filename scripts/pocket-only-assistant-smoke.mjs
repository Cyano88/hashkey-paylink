import assert from 'node:assert/strict';import {build} from 'esbuild';import fs from 'node:fs';
fs.mkdirSync('.codex-temp',{recursive:true});process.env.HELPER_USAGE_STORE='.codex-temp/pocket-only-assistant-usage.json';
const mocks={
 './circle-pocket-identity.js':`export const resolveCirclePocketIdentity=async(req)=>{if(req.headers.authorization!=='Bearer fixture')throw Object.assign(Error('Unauthorized'),{status:401});return {kind:'privy',storageKey:'privy:fixture-pocket',subject:'fixture-pocket'}};export const circlePocketIdentityErrorStatus=e=>e.status||401`,
 './helper-profile.js':`export const readHelperProfileMemory=async()=>''`,
 './zeroscout-sponsored-action.js':`export const getZeroScoutHelperGuidance=async()=>undefined;export const sponsorZeroScoutAction=async()=>({fixture:true})`,
 './render-durable-store.js':`let state={usage:{}};export const readDurableJson=async()=>state;export const writeDurableJson=async(k,v)=>{state=v}`,
 '../modules/streampay/api/content.js':`export const buildHashpayStreamAgentContext=async()=>{throw Error('Retired assistant context must not execute')}`,
}
await build({entryPoints:['api/agent-ask.ts'],outfile:'.codex-temp/pocket-only-assistant-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {default:handler}=await import('../.codex-temp/pocket-only-assistant-test.mjs');const originalFetch=globalThis.fetch;globalThis.fetch=async()=>{throw Error('Unexpected real network access')}
async function call(body,headers={}){let status=200,payload;await handler({method:'POST',body,headers},{setHeader(){},status(s){status=s;return this},json(v){payload=v;return this}});return {status,payload}}
try{
 for(const mode of ['streampay','polydesk','daily','services','support',undefined,''])assert.equal((await call({accessMode:'helper-free',helperMode:mode,question:'hello'},{authorization:'Bearer fixture'})).status,410)
 assert.equal((await call({accessMode:'paid',helperMode:'circle-pocket',question:'hello'},{authorization:'Bearer fixture'})).status,410)
 const body={accessMode:'helper-free',helperMode:'circle-pocket',question:'hello'};
 assert.equal((await call(body)).status,401)
 const good=await call(body,{authorization:'Bearer fixture'});assert.equal(good.status,200,JSON.stringify(good.payload));assert.equal(typeof good.payload.answer,'string');assert.ok(good.payload.answer.length>0);assert.equal(good.payload.paymentVerified,false);assert.equal('upgradeLink' in good.payload,false)
 const api=fs.readFileSync('api/agent-ask.ts','utf8'),ui=fs.readFileSync('src/components/AgentHashPanel.tsx','utf8');assert.doesNotMatch(api+ui,/agentHashProPaymentLink|Agent Hash Pro|AGENT_HASH_PRO_TREASURY|upgradeAmount/);assert.doesNotMatch(api,/lookupLegacyArchive|verifyPayment\(/)
 assert.doesNotMatch(fs.readFileSync('modules/streampay/src/components/StreamPayLayout.tsx','utf8'),/StreamAgentHash/)
 assert.match(fs.readFileSync('src/pocket/pages/PocketAssistantPage.tsx','utf8'),/lockedHelperMode='circle-pocket'/)
 console.log('PASS Pocket-only assistant: authenticated Pocket responds; all retired modes/paid access reject; no paid upsell or archive authorization; launcher removed.')
}finally{globalThis.fetch=originalFetch}
