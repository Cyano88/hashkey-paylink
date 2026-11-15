import assert from 'node:assert/strict'
import {build} from 'esbuild'
const state={calls:[],fail:false};globalThis.__countryCapacity=state
await build({entryPoints:['api/pocket/spending-limits.ts'],outfile:'.codex-temp/country-capacity-fixture.cjs',bundle:true,platform:'node',format:'cjs',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/privy-circle-link\.js|paycrest-pos\.js/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('privy-circle')?`export async function verifiedPrivyUser(req){if(!req.headers.authorization)throw Object.assign(Error('Sign in'),{status:401});return {userId:'fixture'}}`:`export async function resolvePaycrestOfframpAvailability(input){const s=globalThis.__countryCapacity;s.calls.push(input);if(s.fail)throw Error('Provider unavailable');return {availableUsdc:input.fiat==='UGX'?'900':'3700',rate:input.fiat==='UGX'?4100:1400,exact:false}}`,loader:'js'}))}}]})
const {default:module}=await import('../.codex-temp/country-capacity-fixture.cjs');const handler=module.default
async function request(country,authorized=true){const res={code:200,setHeader(){},status(c){this.code=c;return this},json(body){this.body=body;return this}};await handler({method:'GET',headers:authorized?{authorization:'fixture'}:{},query:country===undefined?{}:{country}},res);return res}
assert.equal((await request('NG',false)).code,401);assert.equal(state.calls.length,0)
assert.equal((await request('KE')).code,400);assert.equal(state.calls.length,0)
const ng=await request('NG');assert.equal(ng.body.countryLimits.currency,'NGN');assert.equal(ng.body.countryLimits.availableMaximum,5180000)
state.fail=true;assert.equal((await request('UG')).code,503);state.fail=false
const ug=await request('UG');assert.equal(ug.body.countryLimits.currency,'UGX');assert.equal(ug.body.countryLimits.availableMaximum,3690000);assert.equal(ug.body.countryLimits.country,'UG')
const count=state.calls.length;await request('NG');await request('UG');assert.equal(state.calls.length,count,'Cache is separated by currency')
const legacy=await request();assert.equal(legacy.body.bankPayout.maxUsdc,3700);assert.equal(legacy.body.countryLimits,undefined)
console.log('PASS authenticated country capacity, invalid-country rejection, NGN/UGX isolation, failure without fallback, per-currency cache and legacy compatibility.')
