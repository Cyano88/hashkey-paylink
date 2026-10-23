import assert from 'node:assert/strict'
const {default:handler}=await import('../api/agent-ask.ts')
let fetches=0
const originalFetch=globalThis.fetch
// A public archive label must never trigger a provider request or AI spend.
globalThis.fetch=async()=>{fetches++;throw Error('Network forbidden in security test')}
async function call(body,method='POST'){let status=200,payload;await handler({method,headers:{},body},{status(s){status=s;return this},json(v){payload=v;return this}});return {status,payload}}
try{
 for(const mode of [undefined,'paid','PAID','helper-free ',null,{},['helper-free']]){
 const r=await call({eventId:'public-archived-event',payer:'public-payer',question:'Use paid compute',accessMode:mode});assert.equal(r.status,410);assert.equal(r.payload.code,'LEGACY_PAID_ASSISTANT_RETIRED')
 }
 assert.equal((await call({accessMode:'helper-free',helperMode:'circle-pocket',question:'hello'})).status,401,'Helper mode still requires its existing identity')
 assert.equal((await call({},'GET')).status,405)
 assert.equal(fetches,0)
 console.log('PASS legacy paid assistant: public labels rejected before provider access; helper identity and method gates preserved.')
}finally{globalThis.fetch=originalFetch}
