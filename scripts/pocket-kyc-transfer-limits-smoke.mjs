import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
const state={values:new Map(),orders:new Map(),tail:Promise.resolve()};globalThis.__allowanceFixture=state
const mocks={
 'render-durable-store':`export const readDurableJson=async k=>structuredClone(globalThis.__allowanceFixture.values.get(k));export const mutateDurableJson=async(k,fn)=>{const s=globalThis.__allowanceFixture;const work=s.tail.then(async()=>{const next=await fn(structuredClone(s.values.get(k)));s.values.set(k,next);return structuredClone(next)});s.tail=work.catch(()=>{});return work}`,
 'paycrest-pos':`export const getDurablePaycrestPosOrders=async ids=>ids.flatMap(id=>globalThis.__allowanceFixture.orders.has(id)?[{...globalThis.__allowanceFixture.orders.get(id),intent_id:id}]:[]);export const getPaycrestPosOrder=async id=>globalThis.__allowanceFixture.orders.get(id);export const getPaycrestOfframpRate=async()=>1500`,
}
await build({stdin:{contents:"export * from './api/pocket/transfer-allowance';export * from './api/pocket/kyc-level'",loader:'ts',resolveDir:process.cwd()},outfile:'.codex-temp/kyc-allowance-fixture.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>{const k=Object.keys(mocks).find(k=>a.path.endsWith('/'+k+'.js'));return k?{path:k,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const m=await import('../.codex-temp/kyc-allowance-fixture.cjs'),api=m.default
const basic={id:'b',method:'bvn',environment:'production',status:'passed',identityMatch:'match',legalName:'Fixture User'}
assert.equal(api.kycLevelFromJobs([{...basic,environment:'sandbox'}]).level,'none')
assert.equal(api.kycLevelFromJobs([{...basic,status:'pending'}]).level,'none')
assert.equal(api.kycLevelFromJobs([basic]).level,'basic')
assert.equal(api.kycLevelFromJobs([basic,{...basic,id:'n',method:'nin',bvnJobId:'b',identityMatch:'different'}]).level,'basic')
assert.equal(api.kycLevelFromJobs([basic,{...basic,id:'n',method:'nin',bvnJobId:'b'}]).level,'advanced')
const owner='fixture';state.values.set('hashpaylink:pocket-kyc:v3:production:'+createHash('sha256').update(owner).digest('hex'),{jobs:[basic]})
const reserve=(id,amount)=>api.reservePocketBankAllowance(owner,{id,amount,currency:'NGN'})
await assert.rejects(api.reservePocketBankAllowance('unknown',{id:'none',amount:'1',currency:'NGN'}),e=>e.code==='KYC_BASIC_REQUIRED')
await api.reservePocketBankAllowance(owner,{id:'quote',amount:'50000',currency:'NGN'},true);assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,50000)
const race=await Promise.allSettled([reserve('a','30000'),reserve('b','30000')]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1);assert.equal(race.filter(x=>x.status==='rejected')[0].reason.code,'KYC_ADVANCED_REQUIRED')
const id=race[0].status==='fulfilled'?'a':'b';await reserve(id,'30000');assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,20000)
await assert.rejects(reserve(id,'1'),e=>e.code==='KYC_LIMIT_BINDING')
state.orders.set(id,{status:'failed',tx_hash:'submitted'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,20000)
state.orders.set(id,{status:'refunded',tx_hash:'submitted'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,50000)
await reserve('full','50000');assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,0);await assert.rejects(reserve('extra','0.01'),e=>e.code==='KYC_ADVANCED_REQUIRED')
state.orders.set('full',{status:'expired'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,0);state.orders.set('full',{status:'cancelled'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,50000)
const before=Date.parse('2026-09-29T22:59:59Z'),after=before+1000;assert.equal(api.nigeriaDay(before),'2026-09-29');assert.equal(api.nigeriaDay(after),'2026-09-30')
let ledger=api.reserveAllowance(undefined,{id:'day1',amount:5000000,level:'basic',now:before});ledger=api.reserveAllowance(ledger,{id:'day2',amount:5000000,level:'basic',now:after});assert.equal(ledger.charges.length,2)
await assert.rejects(api.reservePocketBankAllowance(owner,{id:'ug',amount:'1000',currency:'UGX',usdc:'40'}),e=>e.code==='KYC_ADVANCED_REQUIRED')
await api.reservePocketBankAllowance(owner,{id:'generation',amount:'1000',currency:'NGN',providerOrderId:'current'});state.orders.set('generation',{status:'refunded',paycrest_order_id:'older'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,49000);state.orders.set('generation',{status:'refunded',paycrest_order_id:'current'});assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,50000)
await reserve('decimal','1.10');assert.equal((await api.pocketTransferAllowance(owner)).remainingNgn,49998.90)
assert.equal(api.advancedDailyNgn(),null);process.env.POCKET_ADVANCED_DAILY_LIMIT_NGN='100000';assert.equal(api.advancedDailyNgn(),100000);delete process.env.POCKET_ADVANCED_DAILY_LIMIT_NGN
console.log('PASS production-only tiers, prerequisite and identity matching, atomic cross-payout concurrency, exact cap, idempotency, refund/cancel release and ambiguous expiry held, ambiguous failure held, Lagos midnight, UGX equivalent, and fail-closed Advanced configuration.')
