import assert from 'node:assert/strict'
import {randomUUID} from 'node:crypto'
import {keccak256} from 'viem'
import {createArcTradeHandlers} from '../api/trade-agreement/arc-http.ts'
import {createArcTradeExecutionStore} from '../api/trade-agreement/arc-execution-store.ts'
import {bindArcTradeTerms,ARC_TRADE_POLICY} from '../api/trade-agreement/arc.ts'
import {createArcTradeWalletVerifier} from '../api/trade-agreement/arc-wallet.ts'
import {arcTradeProviderReference} from '../api/trade-agreement/arc-provider.ts'
import {cliRequestScope} from '../api/developer-cli-grants.ts'
const a=n=>'0x'+n.repeat(40),h=n=>'0x'+n.repeat(64)
const buyer='did:privy:buyer',seller='did:privy:seller',wallets={[buyer]:{id:randomUUID(),address:a('1'),blockchain:'ARC'},[seller]:{id:randomUUID(),address:a('2'),blockchain:'ARC'}}
const release={policy:ARC_TRADE_POLICY,chainId:5042,factory:a('3'),arbiter:a('4'),factoryRuntimeHash:keccak256('0x6000')}
const policy={partnerId:'dev_tradeproject',environment:'live',checkoutMode:'human',capabilities:['arc_agreements'],settlementMode:'usdc'}
const executionPolicy={walletRuntimeHash:keccak256('0x6001'),entryPointRuntimeHash:keccak256('0x6002'),walletImplementation:a('5'),walletImplementationRuntimeHash:keccak256('0x6003')}
const env={PRIVY_APP_ID:'test-trade-app',PRIVY_APP_SECRET:'test-secret',HASHPAYLINK_TRADE_ARC_ENABLED:'true'}
const rows=new Map();let tail=Promise.resolve(),project=policy,actor=buyer,challengeCalls=[],timeout=false,wrongWallet=false,providerPatch={},planCalls=0,accountChecks=0
const storage={read:async key=>structuredClone(rows.get(key)),mutate:async(key,update)=>{const next=tail.then(()=>{const value=update(structuredClone(rows.get(key)));rows.set(key,structuredClone(value));return structuredClone(value)});tail=next.catch(()=>{});return next}}
const journal=createArcTradeExecutionStore(storage)
const challengeId='4c0686fb-cd27-5324-a80a-511c661dcb16',transactionId=randomUUID(),transactionHash=h('a')
let transactionCall,correlatedTransactionId=transactionId
const client={getChainId:async()=>5042,getBlockNumber:async()=>100n,getBlock:async()=>({hash:h('b')}),
 getTransaction:async()=>({hash:transactionHash,from:transactionCall.account,to:transactionCall.to,input:transactionCall.data,value:0n,blockHash:h('b'),blockNumber:101n}),
 getTransactionReceipt:async()=>({transactionHash,blockHash:h('b'),blockNumber:101n,status:'success',logs:[]})}
const deps={...storage,env:()=>env,hasStore:()=>true,now:()=>new Date('2026-10-03T00:00:00Z'),policy:async()=>policy,project:async()=>project,
 identity:async()=>actor,wallet:async(user,token)=>{assert.equal(token,'circle-session');return {...wallets[user],...(wrongWallet?{id:randomUUID()}:{})}},
 availability:e=>({enabled:e.HASHPAYLINK_TRADE_ARC_ENABLED==='true',reason:null}),executionPolicy:()=>executionPolicy,
 bind:(...args)=>bindArcTradeTerms(...args,release),journal,client:()=>client,verifyExecutionAccount:async()=>{accountChecks++},
 plan:async({account,action,env})=>{planCalls++;const transaction=action?{account,to:a('6'),data:'0x12345678',value:'0',chainId:5042}:undefined;transactionCall=transaction??transactionCall;return {enabled:env.HASHPAYLINK_TRADE_ARC_ENABLED==='true',actions:['approve','refund'],observedBlock:'95',escrow:a('6'),state:1,transaction}},
 createChallenge:async input=>{challengeCalls.push(input);if(timeout){timeout=false;throw Error('Provider timeout')}return {challengeId}},
 readChallenge:async()=>({id:challengeId,correlationIds:[correlatedTransactionId],status:'COMPLETE'}),
 readTransaction:async()=>({id:transactionId,walletId:wallets[actor].id,blockchain:'ARC',txHash:transactionHash,...providerPatch}),
}
const handlers=createArcTradeHandlers(deps)
async function invoke(handler,body={},extra={}){let status=200,payload,headers={};const res={setHeader:(k,v)=>headers[k]=v,status:n=>{status=n;return res},json:v=>{payload=v;return res}};await handler({method:'POST',headers:{authorization:'Bearer participant','idempotency-key':'trade-draft-fixture-0001'},query:{},body,...extra},res);return {status,payload,headers}}
const terms={kind:'trade',paymentRail:'arc',chainId:5042,paymentToken:'0x3600000000000000000000000000000000000000',title:'Fixture',description:'Synthetic only',amount:'1.25',customerUserId:buyer,providerUserId:seller,trade:{offerId:'11111111-1111-4111-8111-111111111111',listingRevision:1,snapshotHash:'a'.repeat(64),price:'1.00',deliveryFee:'0.25',handover:'Delivery',location:'Test location',carrier:'Test carrier',returns:'Return if materially different.',dispatchDays:1,deliveryDays:2,inspectionHours:24}}
const draft=await invoke(handlers.developer,terms);assert.equal(draft.status,201);const agreement=draft.payload.agreement
assert.equal((await invoke(handlers.developer,terms)).payload.agreement.id,agreement.id)
assert.equal((await invoke(handlers.developer,{...terms,title:'Different'})).status,409)
assert.equal((await invoke(handlers.developer,{...terms,action:'fund'})).status,400)
assert.equal((await invoke(handlers.developer,{...terms,environment:'test'})).status,409)
const base={agreementId:agreement.id,circleUserToken:'circle-session'}
assert.equal((await invoke(handlers.participant,{...base,action:'read'},{headers:{'x-api-key':'hpl_live_test',authorization:'Bearer participant'}})).status,401)
actor='did:privy:stranger';assert.equal((await invoke(handlers.participant,{...base,action:'read'})).status,404);actor=buyer
assert.equal((await invoke(handlers.participant,{...base,action:'accept_terms',consentHash:'wrong'})).status,409)
assert.equal((await invoke(handlers.participant,{...base,action:'accept_terms',consentHash:agreement.consentHash})).status,200)
actor=seller;const accepted=await invoke(handlers.participant,{...base,action:'accept_terms',consentHash:agreement.consentHash});assert.equal(accepted.status,200);assert.ok(accepted.payload.agreement.binding)
actor=buyer;wrongWallet=true;assert.equal((await invoke(handlers.participant,{...base,action:'prepare'})).status,403);wrongWallet=false
const prepared=await invoke(handlers.participant,{...base,action:'prepare'});assert.equal(prepared.status,200);assert.equal(prepared.payload.status.transaction,undefined)
const requestId=randomUUID(),action={...base,action:'challenge',operation:'approve',requestId}
timeout=true;assert.equal((await invoke(handlers.participant,action)).status,500)
const reserved=await journal.find(agreement.id,policy.partnerId,requestId);assert.equal(reserved.status,'reserved')
const issued=await invoke(handlers.participant,action);assert.equal(issued.status,200);assert.equal(issued.payload.execution.challengeId,challengeId)
assert.equal(challengeCalls.length,2);assert.equal(challengeCalls[0].idempotencyKey,challengeCalls[1].idempotencyKey);assert.equal(challengeCalls[0].callData,challengeCalls[1].callData);assert.equal(accountChecks,2)
assert.equal((await invoke(handlers.participant,{...action,operation:'fund'})).status,409)
assert.equal((await invoke(handlers.participant,{...action,requestId:randomUUID()})).status,409)
actor=seller;assert.equal((await invoke(handlers.participant,{...base,action:'recover',requestId})).status,403)
const otherRead=await invoke(handlers.participant,{...base,action:'read'});assert.equal(otherRead.payload.execution.challengeId,undefined);actor=buyer
env.HASHPAYLINK_TRADE_ARC_ENABLED='false';project=null
assert.equal((await invoke(handlers.participant,{...action,requestId:randomUUID()})).status,409)
providerPatch={blockchain:'ARC-TESTNET'};assert.equal((await invoke(handlers.participant,{...base,action:'recover',requestId})).status,409)
providerPatch={txHash:undefined};assert.equal((await invoke(handlers.participant,{...base,action:'recover',requestId})).payload.pending,true)
correlatedTransactionId=randomUUID();assert.equal((await invoke(handlers.participant,{...base,action:'recover',requestId})).status,409);correlatedTransactionId=transactionId
providerPatch={};assert.equal((await invoke(handlers.participant,{...base,action:'recover',requestId})).payload.pending,true)
providerPatch={};client.getBlockNumber=async()=>106n
const recovered=await invoke(handlers.participant,{...base,action:'recover',requestId,transactionHash:h('f')});assert.equal(recovered.status,200);assert.equal(recovered.payload.execution.status,'confirmed');assert.equal(recovered.payload.execution.transactionHash,transactionHash);assert.equal(recovered.payload.fundingEnabled,false)
assert.equal((await journal.find(agreement.id,policy.partnerId,requestId)).transactionHash,transactionHash)
assert.ok(!JSON.stringify([...rows.values()]).includes('circle-session'))
// Production deployment/policy gates cannot be enabled by request data.
const {availability,executionPolicy:ignored,...closedDeps}=deps
env.HASHPAYLINK_TRADE_ARC_ENABLED='true';project=policy
const defaultClosed=createArcTradeHandlers(closedDeps)
assert.equal((await invoke(defaultClosed.developer,terms)).status,409)
const available=await invoke(defaultClosed.developer,{}, {method:'GET',query:{purpose:'availability'}});assert.equal(available.payload.enabled,false)
// Verify stored link + fresh session ownership, including migration during verification.
let link={privyUserId:buyer,chain:'arc',purpose:'payment',circleWalletId:wallets[buyer].id,circleWalletAddress:wallets[buyer].address,circleBlockchain:'ARC',updatedAt:1},ownership=0
const verify=createArcTradeWalletVerifier({read:async()=>link,verify:async input=>{ownership++;assert.equal(input.wallet.id,wallets[buyer].id)}})
assert.equal((await verify(buyer,'session')).address,wallets[buyer].address);assert.equal(ownership,1)
link={...link,circleBlockchain:'ARC-TESTNET'};await assert.rejects(()=>verify(buyer,'session'),/mainnet/);link={...link,circleBlockchain:'ARC'}
const migrating=createArcTradeWalletVerifier({read:async()=>link,verify:async()=>{link={...link,circleWalletId:randomUUID()}}});await assert.rejects(()=>migrating(buyer,'session'),/changed/)
assert.equal(arcTradeProviderReference({correlationIds:[transactionId]},'transactionId'),transactionId)
assert.throws(()=>arcTradeProviderReference({correlationIds:[transactionId,randomUUID()]},'transactionId'),/ambiguous/)
assert.equal(cliRequestScope({method:'GET',originalUrl:'/api/v2/trade-agreements?purpose=availability',query:{purpose:'availability'},body:{}}),'agreement:read')
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/trade-agreements',query:{},body:{kind:'trade'}}),'agreement:create')
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/trade-agreements/participant',query:{},body:{action:'challenge'}}),null)
console.log('Arc hosted Trade passed: draft isolation, exact consent, linked-wallet ownership, participant boundaries, durable timeout recovery, source-only transaction references, paused recovery and inactive production gates. Synthetic adapters; no live Circle calls.')
