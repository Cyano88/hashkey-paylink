import assert from 'node:assert/strict'
import {readMarketplaceRuntimeConfig,marketplaceRuntimeReadiness,createMarketplaceRefundRuntime,createMarketplaceWalletRuntime} from '../api/marketplace/runtime.ts'

const env={MARKETPLACE_REFUND_WORKER_ENABLED:'true',MARKETPLACE_ENVIRONMENT:'base-mainnet',MARKETPLACE_CIRCLE_API_KEY:'fixture_secret_key',MARKETPLACE_CIRCLE_ENTITY_SECRET:'ab'.repeat(32),MARKETPLACE_HOLDING_WALLET_SET_ID:'11111111-1111-4111-8111-111111111111',MARKETPLACE_HOLDING_WALLET_ID:'22222222-2222-4222-8222-222222222222',MARKETPLACE_HOLDING_ADDRESS:'0x'+'22'.repeat(20),MARKETPLACE_HOLDING_ID:'holding_a',MARKETPLACE_HOLDING_REVISION:'revision_a',MARKETPLACE_PROJECT_IDS:'project_a,project_b,project_a',POCKET_BILLS_TREASURY_WALLET_ID:'33333333-3333-4333-8333-333333333333',POCKET_BILLS_TREASURY_ADDRESS:'0x'+'33'.repeat(20)}
const adapters={quoteRefundFees:async()=>{throw Error('No fee quote')},verifyBacking:async()=>({backed:true}),chain:{getChainId:async()=>8453,getTransactionReceipt:async()=>{throw Error('no network')},getBlock:async()=>{throw Error('no network')}},resolveRefundCollection:async()=>null,authorizeRefund:async()=>false}
assert.equal(marketplaceRuntimeReadiness({}).workerConstructible,false)
assert.equal(marketplaceRuntimeReadiness(env).configured,true)
assert.equal(marketplaceRuntimeReadiness(env).workerConstructible,false,'configuration does not supply production adapters')
assert.equal(marketplaceRuntimeReadiness(env,adapters).workerConstructible,true)
assert.equal(marketplaceRuntimeReadiness(env,adapters).liveVerified,false)
assert.equal(marketplaceRuntimeReadiness(env,adapters).publicApiEnabled,false)
assert.equal(readMarketplaceRuntimeConfig(env).config.setupReady,false)
assert.deepEqual(readMarketplaceRuntimeConfig(env).projectIds,['project_a','project_b'])
for(const patch of [{MARKETPLACE_REFUND_WORKER_ENABLED:'false'},{MARKETPLACE_REFUND_WORKER_ENABLED:'1'},{MARKETPLACE_ENVIRONMENT:'sandbox'},{MARKETPLACE_ENVIRONMENT:''},{MARKETPLACE_CIRCLE_API_KEY:''},{MARKETPLACE_CIRCLE_ENTITY_SECRET:'invalid'},{MARKETPLACE_CIRCLE_BASE_URL:'https://example.com'},{MARKETPLACE_HOLDING_WALLET_ID:env.POCKET_BILLS_TREASURY_WALLET_ID},{MARKETPLACE_HOLDING_ADDRESS:env.POCKET_BILLS_TREASURY_ADDRESS},{MARKETPLACE_HOLDING_ADDRESS:'0x'+'00'.repeat(20)},{MARKETPLACE_PROJECT_IDS:''},{MARKETPLACE_PROJECT_IDS:'bad project'},{MARKETPLACE_HOLDING_REVISION:''},{POCKET_BILLS_TREASURY_ADDRESS:''}]){
 const changed={...env,...patch}
 assert.equal(marketplaceRuntimeReadiness(changed,adapters).workerConstructible,false)
 assert.throws(()=>createMarketplaceRefundRuntime({env:changed,adapters}),/not ready/)
}
const fallback={...env,MARKETPLACE_CIRCLE_API_KEY:'',MARKETPLACE_CIRCLE_ENTITY_SECRET:'',MARKETPLACE_HOLDING_WALLET_ID:'',CIRCLE_API_KEY:'generic_secret',CIRCLE_ENTITY_SECRET:'cd'.repeat(32)}
const isolated=readMarketplaceRuntimeConfig(fallback)
assert.equal(isolated.config.apiKey,'');assert.equal(isolated.config.entitySecret,'');assert.equal(isolated.config.walletId,'')
const safe=JSON.stringify(marketplaceRuntimeReadiness(env,adapters))
for(const value of [env.MARKETPLACE_CIRCLE_API_KEY,env.MARKETPLACE_CIRCLE_ENTITY_SECRET,env.MARKETPLACE_HOLDING_WALLET_ID,env.MARKETPLACE_HOLDING_ADDRESS,'project_a'])assert.equal(safe.includes(value),false)
const runtime=createMarketplaceRefundRuntime({env,adapters})
await assert.rejects(()=>runtime.drain('other_project'),/not enabled/)
console.log('PASS runtime readiness: explicit mainnet opt-in, dedicated credentials/holding, Bills isolation, default-off gate, project allowlist, required adapters, safe diagnostics and no network or wallet provisioning.')
assert.equal(marketplaceRuntimeReadiness(env,{...adapters,verifyBacking:undefined}).workerConstructible,false)
assert.throws(()=>createMarketplaceRefundRuntime({env,adapters:{...adapters,verifyBacking:undefined}}),/holding_backing_check_missing/)
console.log('PASS refund runtime cannot construct without a backing-check adapter.')

const walletInput={env:{...env,MARKETPLACE_WALLET_WORKER_ENABLED:'true',MARKETPLACE_INSTRUCTIONS_ENABLED:'true'},chain:{...adapters.chain,readContract:async()=>0n},verifyFees:async()=>{throw Error('No gas attestation')}}
assert.ok(createMarketplaceWalletRuntime(walletInput))
for(const patch of [{MARKETPLACE_WALLET_WORKER_ENABLED:'false'},{MARKETPLACE_PROJECT_IDS:''}])assert.throws(()=>createMarketplaceWalletRuntime({...walletInput,env:{...walletInput.env,...patch}}),/not ready/)
assert.throws(()=>createMarketplaceWalletRuntime({...walletInput,verifyFees:undefined}),/verified_wallet_fee_adapter_missing/)
assert.throws(()=>createMarketplaceWalletRuntime({...walletInput,chain:{...adapters.chain}}),/base_rpc_client_missing/)
console.log('PASS internal wallet runtime requires explicit gates, Base read client, isolated holding and an external verified gas adapter; construction does not send funds.')

assert.equal(marketplaceRuntimeReadiness(env,{...adapters,quoteRefundFees:undefined}).workerConstructible,false)

assert.ok(createMarketplaceWalletRuntime({...walletInput,env:{...walletInput.env,MARKETPLACE_INSTRUCTIONS_ENABLED:'false'}}),'disabled new instructions must not prevent reconciliation construction')
