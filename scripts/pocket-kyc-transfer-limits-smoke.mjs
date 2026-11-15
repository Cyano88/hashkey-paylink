import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createHash} from 'node:crypto'
const state={values:new Map(),orders:new Map(),tail:Promise.resolve(),capacity:6992};globalThis.__allowanceFixture=state
const mocks={
 'spending-limits':`export const readPocketBankPayoutLimit=async()=>({maxUsdc:globalThis.__allowanceFixture.capacity})`,
 'render-durable-store':`export const readDurableJson=async k=>structuredClone(globalThis.__allowanceFixture.values.get(k));export const mutateDurableJson=async(k,fn)=>{const s=globalThis.__allowanceFixture;const work=s.tail.then(async()=>{const next=await fn(structuredClone(s.values.get(k)));s.values.set(k,next);return structuredClone(next)});s.tail=work.catch(()=>{});return work}`,
 'paycrest-pos':`export const getDurablePaycrestPosOrders=async ids=>ids.flatMap(id=>globalThis.__allowanceFixture.orders.has(id)?[{...globalThis.__allowanceFixture.orders.get(id),intent_id:id}]:[]);export const getPaycrestPosOrder=async id=>globalThis.__allowanceFixture.orders.get(id);export const getPaycrestOfframpRate=async()=>1500`,
}
await build({stdin:{contents:"export * from './api/pocket/transfer-allowance';export * from './api/pocket/kyc-level'",loader:'ts',resolveDir:process.cwd()},outfile:'.codex-temp/kyc-allowance-fixture.cjs',bundle:true,platform:'node',format:'cjs',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>{const k=Object.keys(mocks).find(k=>a.path.endsWith('/'+k+'.js'));return k?{path:k,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const m=await import('../.codex-temp/kyc-allowance-fixture.cjs'),api=m.default
const basic={id:'b',method:'bvn',environment:'production',status:'passed',identityMatch:'match',legalName:'Fixture User'}
const ninBasic={...basic,id:'nin-basic',method:'nin',tierPolicy:'ng-nin-first-v1',tier:'basic'}
const bvnAdvanced={...basic,id:'bvn-advanced',tierPolicy:'ng-nin-first-v1',tier:'advanced',basicJobId:ninBasic.id}
assert.equal(api.kycLevelFromJobs([ninBasic]).level,'basic')
assert.equal(api.kycLevelFromJobs([{...ninBasic,environment:'sandbox'}]).level,'none')
assert.equal(api.kycLevelFromJobs([{...ninBasic,tierPolicy:undefined}]).level,'none','Historical unpaired NIN cannot become Basic')
assert.equal(api.kycLevelFromJobs([bvnAdvanced]).level,'none','Advanced BVN is never standalone Basic')
assert.equal(api.kycLevelFromJobs([ninBasic,bvnAdvanced]).level,'advanced')
assert.equal(api.kycLevelFromJobs([ninBasic,{...bvnAdvanced,identityMatch:'other'}]).level,'basic')
assert.equal(api.kycLevelFromJobs([ninBasic,{...bvnAdvanced,environment:'sandbox'}]).level,'basic')
assert.equal(api.kycLevelFromJobs([{...basic,environment:'sandbox'}]).level,'none')
assert.equal(api.kycLevelFromJobs([{...basic,status:'pending'}]).level,'none')
assert.equal(api.kycLevelFromJobs([basic]).level,'basic')
assert.equal(api.kycLevelFromJobs([basic,{...basic,id:'n',method:'nin',bvnJobId:'b',identityMatch:'different'}]).level,'basic')
assert.equal(api.kycLevelFromJobs([basic,{...basic,id:'n',method:'nin',bvnJobId:'b'}]).level,'advanced')
const owner='fixture',kycKey=id=>'hashpaylink:pocket-kyc:v3:production:'+createHash('sha256').update(id).digest('hex'),ledgerKey=id=>'hashpaylink:pocket-transfer-allowance:v1:'+createHash('sha256').update(id).digest('hex')
state.values.set(kycKey(owner),{jobs:[basic]})
const reserve=(id,usd,extra={})=>api.reservePocketBankAllowance(owner,{id,amount:String(Number(usd)*1500),currency:'NGN',usdc:usd,...extra})
await assert.rejects(api.reservePocketBankAllowance('unknown',{id:'none',amount:'1500',currency:'NGN',usdc:'1'}),e=>e.code==='KYC_BASIC_REQUIRED')
await api.reservePocketBankAllowance(owner,{id:'quote',amount:'75000',currency:'NGN',usdc:'50'},true)
assert.equal((await api.pocketTransferAllowance(owner)).remainingUsd,50)
const race=await Promise.allSettled([reserve('a','30'),reserve('b','30')]);assert.equal(race.filter(x=>x.status==='fulfilled').length,1)
assert.equal(race.find(x=>x.status==='rejected').reason.code,'KYC_ADVANCED_REQUIRED')
const id=race[0].status==='fulfilled'?'a':'b';await reserve(id,'30');assert.equal((await api.pocketTransferAllowance(owner)).remainingUsd,20)
await assert.rejects(reserve(id,'31'),e=>e.code==='KYC_LIMIT_BINDING')
await reserve('exact','20');await assert.rejects(reserve('over','0.000001',{amount:'0.01'}),e=>e.code==='KYC_ADVANCED_REQUIRED')
state.orders.set(id,{status:'failed',tx_hash:'0xuncertain'});assert.equal((await api.pocketTransferAllowance(owner)).remainingUsd,0)
state.orders.set(id,{status:'refunded'});assert.equal((await api.pocketTransferAllowance(owner)).remainingUsd,30)
// Upgrade does not reset same-day spending.
state.values.set(kycKey(owner),{jobs:[basic,{...basic,id:'n',method:'nin',bvnJobId:'b'}]})
assert.equal((await api.pocketTransferAllowance(owner)).dailyLimitUsd,7000)
assert.equal((await api.pocketTransferAllowance(owner)).remainingUsd,6980)
await reserve('advanced','6980');await assert.rejects(reserve('advanced-over','1'),e=>e.code==='KYC_DAILY_LIMIT')
// FX/currency changes do not rewrite a reserved USD value; changing a quote is a new payment.
await assert.rejects(api.reservePocketBankAllowance(owner,{id:'advanced',amount:String(6980*1500),currency:'NGN',usdc:'6979'}),e=>e.code==='KYC_LIMIT_BINDING')
const other='legacy';state.values.set(kycKey(other),{jobs:[basic]})
state.values.set(ledgerKey(other),{charges:[{id:'old',day:api.utcAllowanceDay(Date.now()),amount:3000000,state:'reserved',createdAt:Date.now(),providerOrderId:'provider',binding:JSON.stringify(['NGN','30000'])}]})
state.orders.set('old',{status:'settled',amount_usdc:'20',paycrest_order_id:'provider',tx_hash:'confirmed'})
state.orders.set('old',{status:'settled',amount_usdc:'20',paycrest_order_id:'different-provider',tx_hash:'confirmed'})
await assert.rejects(api.pocketTransferAllowance(other),e=>e.code==='KYC_LIMIT_UNAVAILABLE','Mismatched provider evidence cannot revalue legacy usage')
state.orders.delete('old')
await assert.rejects(api.pocketTransferAllowance(other),e=>e.code==='KYC_LIMIT_UNAVAILABLE','Missing historical evidence cannot reset usage')
state.orders.set('old',{status:'settled',amount_usdc:'20',paycrest_order_id:'provider',tx_hash:'confirmed'})
assert.equal((await api.pocketTransferAllowance(other)).remainingUsd,30,'Legacy usage hydrated from original provider quote, not current FX')
state.orders.set('old',{status:'settled',amount_usdc:'10',paycrest_order_id:'provider',tx_hash:'confirmed'})
assert.equal((await api.pocketTransferAllowance(other)).remainingUsd,30,'Frozen valuation cannot drift')
state.capacity=10
await assert.rejects(api.reservePocketBankAllowance(other,{id:'capacity',amount:'30000',currency:'NGN',usdc:'20'},true),e=>e.code==='KYC_TRANSFER_CAPACITY')
state.capacity=30
await api.reservePocketBankAllowance(other,{id:'capacity',amount:'30000',currency:'NGN',usdc:'20'},true)
const before=Date.parse('2026-09-29T23:59:59Z'),after=Date.parse('2026-09-30T00:00:00Z')
assert.equal(api.utcAllowanceDay(before),'2026-09-29');assert.equal(api.utcAllowanceDay(after),'2026-09-30')
let ledger=api.reserveAllowance(undefined,{id:'day1',amount:7500000,usdUnits:50000000,level:'basic',now:before})
ledger=api.reserveAllowance(ledger,{id:'day2',amount:7000000,usdUnits:50000000,level:'basic',now:after});assert.equal(ledger.charges.length,2)
// Existing Uganda verification mapping is preserved; cross-currency spending shares one account ledger.
const ugBasic={...basic,country:'UG',method:'national_id',legalName:undefined,resultCode:'1020'}
assert.equal(api.kycLevelFromJobs([ugBasic]).level,'basic');assert.equal(api.kycLevelFromJobs([ugBasic]).paymentLevel,'advanced')
for(const patch of [{environment:'sandbox'},{status:'pending'},{resultCode:'1021'},{identityMatch:undefined}])assert.equal(api.kycLevelFromJobs([{...ugBasic,...patch}]).level,'none')
const ugOwner='uganda';state.values.set(kycKey(ugOwner),{jobs:[ugBasic]})
await api.reservePocketBankAllowance(ugOwner,{id:'ugx',amount:'74000',currency:'UGX',usdc:'20'})
await api.reservePocketBankAllowance(ugOwner,{id:'ngn',amount:'30000',currency:'NGN',usdc:'20'})
assert.equal((await api.pocketTransferAllowance(ugOwner)).remainingUsd,6960)
console.log('PASS Basic USD 50 / Advanced USD 7000, verified tiers, atomic reservations, upgrade continuity, retry binding, frozen provider valuation, legacy migration, dynamic capacity, refunds, cross-currency totals and UTC reset.')
