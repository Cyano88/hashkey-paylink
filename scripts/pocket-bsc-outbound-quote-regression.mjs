import assert from 'node:assert/strict'
import {build} from 'esbuild'
globalThis.bnbFixture={balance:1020000000000000000n,estimates:0,fee:19000000000000000n,coverage:18000000000000000n}
const mocks={
 '@privy-io/server-auth':`export class PrivyClient {async getUserById(){return {linkedAccounts:[{type:'wallet',chainType:'ethereum',walletClientType:'privy',id:'wallet12345678',address:'0x'+'1'.repeat(40)}]}}}`,
 '../privy-circle-link.js':`export const verifiedPrivyUser=async()=>({userId:'fixture'}),circleLinkKey=()=>'',readCircleLink=async()=>({circleWalletAddress:'0x'+'2'.repeat(40)})`,
 '../render-durable-store.js':`export const hasRenderDurableStore=()=>true,readDurableJson=async()=>undefined,mutateDurableJson=async()=>{throw Error('No writes allowed')}`,
 './bsc-runtime.js':`export const bscConfiguredFeePolicy=()=>({}),createBscRuntime=()=>({rpc:async()=>{},balance:async()=>globalThis.bnbFixture.balance})`,
 './bsc-bridge-fee-estimator.js':`export const createBscBridgeFeeEstimator=()=>async q=>{const f=globalThis.bnbFixture;f.estimates++;if(BigInt(q.totalInputUnits)>f.balance)throw Error('Simulation must not run with an unaffordable debit');return {feeUnits:String(f.fee),coverageFeeUnits:String(f.coverage),expiresAt:q.expiresAt}}`,
 './bsc-bridge-provider.js':`export const quoteBscRelay=async()=>({minimumUnits:'971000',receiveUnits:'975000',orderId:'0x'+'a'.repeat(64),requestId:'0x'+'b'.repeat(64),expiresAt:Date.now()+45000})`,
 './bsc-bridge-billing.js':`export const createBscBridgeBillingGuard=()=>async()=>{}`,
 './bsc-bridge-settlement.js':`export const createBscBridgeSettlement=()=>async()=>{throw Error('No settlement allowed')}`,
 './money-ledger.js':`export const appendPocketMoneyLedgerEvent=async()=>{throw Error('No ledger writes allowed')}`,
 '../circle-pocket-action-journal.js':`export const recordCirclePocketAction=async()=>{throw Error('No journal writes allowed')}`,
 './payment-security.js':`export const consumePocketPaymentApproval=async()=>{throw Error('No approval allowed')}`,
}
await build({entryPoints:['api/pocket/bsc-outbound-bridge.ts'],outfile:'.codex-temp/bsc-outbound-quote-regression.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
const {createBscOutboundService}=await import('../.codex-temp/bsc-outbound-quote-regression.mjs')
const {handler}=createBscOutboundService({PRIVY_APP_ID:'app123',PRIVY_APP_SECRET:'fixture',POCKET_SWAP_QUOTE_SECRET:'a'.repeat(32),POCKET_BSC_BRIDGE_ENABLED:'true',POCKET_PRIVY_COMBINED_BILLING_ENABLED:'true',RELAY_API_KEY:'fixture'})
async function quote(){let status=200,result;await handler({method:'POST',body:{action:'quote',source:'bsc',destination:'base',asset:'USDC',amount:'1'}},{setHeader(){},status(n){status=n;return this},json(data){result=data;return this}});return {status,...result}}
let result=await quote();assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.sufficientBalance,true);assert.equal(result.quote.total,'1.019');assert.equal(bnbFixture.estimates,2)
bnbFixture.balance=1010000000000000000n;bnbFixture.estimates=0;result=await quote();assert.equal(result.status,422);assert.match(result.error,/Insufficient USDC/);assert.equal(bnbFixture.estimates,1)
bnbFixture.balance=1000000000000000000n;bnbFixture.estimates=0;result=await quote();assert.equal(result.status,422);assert.equal(bnbFixture.estimates,0)
console.log('PASS BNB outbound quote: 1 USDC near-balance review, fee-inclusive insufficiency before simulation, no writes or signing.')
