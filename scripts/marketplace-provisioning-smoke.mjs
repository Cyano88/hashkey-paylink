import assert from 'node:assert/strict'
import {createMarketplaceProvisioning} from '../api/marketplace/provisioning.ts'
const setId='11111111-1111-4111-8111-111111111111',walletId='22222222-2222-4222-8222-222222222222'
const env={MARKETPLACE_PROVISIONING_ENABLED:'true',MARKETPLACE_ENVIRONMENT:'base-mainnet',MARKETPLACE_HOLDING_ID:'holding_a',MARKETPLACE_HOLDING_REVISION:'revision_a',MARKETPLACE_CIRCLE_API_KEY:'fixture',MARKETPLACE_CIRCLE_ENTITY_SECRET:'ab'.repeat(32),POCKET_BILLS_TREASURY_WALLET_ID:'33333333-3333-4333-8333-333333333333',POCKET_BILLS_TREASURY_WALLET_SET_ID:'44444444-4444-4444-8444-444444444444',POCKET_BILLS_TREASURY_ADDRESS:'0x'+'33'.repeat(20)}
const wallet={id:walletId,walletSetId:setId,address:'0x'+'22'.repeat(20),blockchain:'BASE',accountType:'SCA',state:'LIVE'}
let stored,queue=Promise.resolve(),setTimeout=true,walletTimeout=true,readMismatch=false,creates=0
const sets=new Map(),wallets=new Map()
const deps={read:async()=>structuredClone(stored),mutate:fn=>{const job=queue.then(()=>{stored=fn(structuredClone(stored??{}));return structuredClone(stored)});queue=job.catch(()=>{});return job},client:config=>({createWalletSet:async()=>{assert.equal(stored.setup.walletSetKey,config.walletSetIdempotencyKey);if(!sets.has(config.walletSetIdempotencyKey)){sets.set(config.walletSetIdempotencyKey,{id:setId});creates++}if(setTimeout){setTimeout=false;throw Error('timeout after creation')}return sets.get(config.walletSetIdempotencyKey)},createWallet:async id=>{assert.equal(id,setId);assert.equal(stored.setup.walletKey,config.walletIdempotencyKey);if(!wallets.has(config.walletIdempotencyKey)){wallets.set(config.walletIdempotencyKey,wallet);creates++}if(walletTimeout){walletTimeout=false;throw Error('timeout after creation')}return wallets.get(config.walletIdempotencyKey)},getWallet:async()=>({...wallet,...(readMismatch?{address:env.POCKET_BILLS_TREASURY_ADDRESS}:{})})})}
const setup=createMarketplaceProvisioning(env,deps)
await assert.rejects(()=>setup.provision(),/timeout/);const first=structuredClone(stored)
await assert.rejects(()=>createMarketplaceProvisioning(env,deps).provision(),/timeout/)
assert.equal(stored.setup.walletSetKey,first.setup.walletSetKey);assert.equal(stored.setup.walletKey,first.setup.walletKey)
const result=await Promise.all([setup.provision(),setup.provision()]);assert.equal(creates,2);assert.equal(result[0].activationEnabled,false);assert.equal(result[0].configuration.MARKETPLACE_HOLDING_WALLET_ID,walletId);assert.equal(stored.setup.verified,true)
await setup.provision();assert.equal(creates,2)
await assert.rejects(()=>createMarketplaceProvisioning({...env,MARKETPLACE_HOLDING_REVISION:'new_revision'},deps).provision(),/changed/)
readMismatch=true;await assert.rejects(()=>setup.provision(),/isolated/)
for(const patch of [{MARKETPLACE_PROVISIONING_ENABLED:'false'},{MARKETPLACE_CIRCLE_API_KEY:''},{MARKETPLACE_HOLDING_WALLET_ID:walletId},{POCKET_BILLS_TREASURY_WALLET_SET_ID:''}]){const blocked=createMarketplaceProvisioning({...env,...patch},deps);assert.equal(blocked.readiness().ready,false);await assert.rejects(()=>blocked.provision(),/not ready/)}
assert.equal(JSON.stringify(result).includes(env.MARKETPLACE_CIRCLE_ENTITY_SECRET),false)
console.log('PASS Marketplace provisioning: durable keys before provider calls, timeout/restart/concurrent recovery, separate Bills identity, read-back verification, immutable configuration and no activation/secret output. Mock provider only.')
