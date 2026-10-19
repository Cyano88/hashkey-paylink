import assert from 'node:assert/strict'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import {encodeAbiParameters,encodeEventTopics} from 'viem'
import {reconcileUsdtBridge} from '../api/pocket/usdt-bridge.ts'
import {sealUsdtBridgeQuote,USDT_TRANSFER_ABI,USDT_BRIDGE_ROUTER} from '../api/pocket/usdt-bridge-provider.ts'
import {pocketMoneyNotification} from '../src/pocket/lib/pocketMoneyNotification.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
import {runPocketMoneyPushWorker} from '../api/pocket/money-push-worker.ts'

process.env.POCKET_SWAP_QUOTE_SECRET='recovery-test-only-secret-longer-than-32-characters'
const wallet='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222'
const tokenIn='0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',tokenOut='0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2'
const txHash='0x'+'11'.repeat(32),destinationTxHash='0x'+'22'.repeat(32),transactionId='0x'+'33'.repeat(32)
const q={id:'quote-one',ownerId:'owner',walletId:'wallet',walletAddress:wallet,destinationAddress:recipient,source:'arbitrum',destination:'base',amount:'1',amountUnits:'1000000',minimumUnits:'994438',receive:'0.994438',minimumReceive:'0.994438',fee:'0.005562',expiresAt:Date.now()-1000,transactionId,provider:'across',callData:'0x'}
const quoteToken=sealUsdtBridgeQuote(q)
const transfer=(address,from,to,value)=>({address,topics:encodeEventTopics({abi:USDT_TRANSFER_ABI,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters([{type:'uint256'}],[value])})
const bridge={transactionId,bridge:'across',integrator:'hashpaylink',referrer:wallet,sendingAssetId:tokenIn,receiver:recipient,minAmount:1000000n,destinationChainId:8453n,hasSourceSwaps:false,hasDestinationCall:false}
const event=USDT_TRANSFER_ABI.find(x=>x.name==='LiFiTransferStarted')
const startLog={address:USDT_BRIDGE_ROUTER,topics:encodeEventTopics({abi:USDT_TRANSFER_ABI,eventName:'LiFiTransferStarted'}),data:encodeAbiParameters(event.inputs,[bridge])}
const sourceReceipt={status:'success',logs:[transfer(tokenIn,wallet,USDT_BRIDGE_ROUTER,1000000n),startLog]}
const destinationReceipt={transactionHash:destinationTxHash,blockNumber:1n,blockHash:'0x'+'44'.repeat(32),status:'success',logs:[transfer(tokenOut,USDT_BRIDGE_ROUTER,recipient,994438n)]}
const record={id:'record',ownerId:'owner',action:'wallet.usdt-bridge',status:'submitted',metadata:{quoteToken},updatedAt:Date.now()}
let stored=record,ledger=[],writes=[]
const deps={findAction:async()=>stored,recordAction:async input=>{writes.push(input);stored={...stored,...input};return stored},appendLedger:async input=>{ledger.push(input)},readActivity:async()=>[{assetSymbol:'USDT',direction:'out',ts:Date.now(),txHash}],client:network=>({getChainId:async()=>8453,getBlock:async()=>({hash:destinationReceipt.blockHash}),getTransactionReceipt:async()=>network==='arbitrum'?sourceReceipt:destinationReceipt}),fetch:async()=>({ok:true,json:async()=>({status:'DONE',substatus:'COMPLETED',sending:{txHash},receiving:{chainId:'8453',txHash:destinationTxHash}})})}
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{},deps)).status,'completed','lost SDK hash must recover from exact onchain quote event')
assert.equal(stored.metadata.settledAmountUnits,'994438');assert.equal(ledger[0].asset,'USDT');assert.equal(stored.metadata.destinationTxHash,destinationTxHash)
const replay=await reconcileUsdtBridge('owner',quoteToken,{},deps);assert.equal(replay.amountOut,'0.994438');assert.equal(replay.settlement.amountUnits,'994438');assert.equal(ledger.length,2,'completed records retry idempotent ledger append')
stored=record
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{txHash},{...deps,client:network=>({getChainId:async()=>8453,getBlock:async()=>({hash:destinationReceipt.blockHash}),getTransactionReceipt:async()=>network==='arbitrum'?sourceReceipt:{status:'success',logs:[transfer(tokenIn,USDT_BRIDGE_ROUTER,recipient,994438n)]}})})).status,'pending','wrong destination asset cannot complete bridge')
stored=record
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{}, {...deps,client:()=>({getChainId:async()=>8453,getBlock:async()=>({hash:destinationReceipt.blockHash}),getTransactionReceipt:async()=>({status:'success',logs:[]})})})).status,'pending','unrelated wallet debit cannot recover quote')
await assert.rejects(()=>reconcileUsdtBridge('other',quoteToken,{},deps))

const row={eventId:'bridge',source:'wallet-bridge',chain:'arbitrum',destination:'base',payer:wallet,amount:'1',assetSymbol:'USDT',ts:Date.now()-40000,txHash,destinationTxHash,paycrestStatus:'completed',direction:'out'}
for(const asset of ['USDC','USDT']){
 const notice=pocketMoneyNotification({...row,assetSymbol:asset})
 assert.equal(notice.title,'Bridge successful');assert.equal(notice.body,`1 ${asset} bridged from Arbitrum to Base.`)
 for(const direction of ['in','out']){const notice=pocketMoneyNotification({...row,source:direction==='in'?'wallet-deposit':'wallet-withdrawal',direction,assetSymbol:asset});assert.equal(notice.title,asset+(direction==='in'?' received':' sent'));assert(!notice.body.includes(asset==='USDT'?'USDC':'USDT'))}
 assert.equal(pocketMoneyNotification({...row,assetSymbol:asset,paycrestStatus:'processing'}),null)
}
const raw=[{...row,eventId:'debit',source:'wallet-withdrawal',paycrestStatus:'confirmed'},{...row,eventId:'credit',source:'wallet-deposit',chain:'base',txHash:destinationTxHash,direction:'in',paycrestStatus:'confirmed'},{...row,eventId:'other',source:'wallet-deposit',chain:'base',txHash:'0x'+'44'.repeat(32),direction:'in',paycrestStatus:'confirmed'}]
assert.deepEqual(mergePocketActivityRows(raw,[row]).map(x=>x.eventId).sort(),['bridge','other'])
let pushes=[],paid=0
await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['owner'],now:()=>Date.now(),readActivity:async()=>raw,readWallets:async()=>[],listActions:async()=>[{action:'wallet.usdt-bridge',metadata:{txHash,destinationTxHash}}],listRequests:async()=>[],readContext:async()=>[row],sendPush:async(owner,id,notice)=>pushes.push(notice)})
assert.equal(pushes.filter(n=>n.title==='Bridge successful').length,1);assert.equal(pushes.filter(n=>n.title==='USDT sent').length,0);assert.equal(pushes.filter(n=>n.title==='USDT received').length,1,'only unrelated deposit remains')
await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['owner'],now:()=>Date.now(),readActivity:async()=>[{...raw[0],paycrestStatus:'confirmed',recipient}],readWallets:async()=>[],listActions:async()=>[],readContext:async()=>[],listRequests:async()=>[{id:'request-separate-asset',status:'accepted',amount:'1',updatedAt:row.ts-1000,recipientId:'owner',senderAddress:recipient,network:'base'}],markRequestPaid:async()=>{paid++},findEvm:async()=>null,sendPush:async()=>{}})
assert.equal(paid,0,'USDT cannot settle a USDC request')
console.log('PASS USDT missing-hash recovery, destination token proof, ledger retry, per-asset notifications, bridge leg grouping and USDC-request isolation')

const charged={...q,networkFeeUnits:'3000',totalUnits:'1003000',total:'1.003',reimbursementTreasury:EVM_PLATFORM_TREASURY}
const chargedToken=sealUsdtBridgeQuote(charged)
for(const destination of [EVM_PLATFORM_TREASURY,recipient]){
 stored=record
 const fundedReceipt={...sourceReceipt,logs:[...sourceReceipt.logs,transfer(tokenIn,wallet,destination,3000n)]}
 const result=await reconcileUsdtBridge('owner',chargedToken,{txHash},{...deps,client:network=>({getChainId:async()=>8453,getBlock:async()=>({hash:destinationReceipt.blockHash}),getTransactionReceipt:async()=>network==='arbitrum'?fundedReceipt:destinationReceipt})})
 assert.equal(result.status,destination===EVM_PLATFORM_TREASURY?'completed':'needs_attention','exact reimbursement recipient is required')
}
stored=record
assert.equal((await reconcileUsdtBridge('owner',chargedToken,{txHash},deps)).status,'needs_attention','missing reimbursement cannot pass source proof')
console.log('PASS USDT total debit and exact treasury reimbursement proof; legacy recovery retained')

stored={...record,metadata:{...record.metadata,challengeId:'saved-challenge'}}
const approvalDeps={...deps,readActivity:async()=>[],readChallenge:async()=>({status:'awaiting_approval'})}
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{circleUserToken:'session'},approvalDeps)).status,'awaiting_approval')
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{},approvalDeps)).status,'pending','missing session must not imply approval is outstanding')
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{circleUserToken:'session'},{...approvalDeps,readChallenge:async()=>{throw Error('provider unavailable')}})).status,'pending','provider outage must not authorize resume')
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{circleUserToken:'session'},{...approvalDeps,readActivity:deps.readActivity})).status,'completed','onchain proof wins over stale pending approval')
console.log('PASS saved approval recovery, missing-session safety, provider outage and stale approval race')

stored={...record,metadata:{...record.metadata,challengeId:'expired-challenge'}}
const expired=await reconcileUsdtBridge('owner',quoteToken,{circleUserToken:'session'},{...approvalDeps,readChallenge:async()=>({status:'failed',notSubmitted:true})})
assert.equal(expired.status,'not_submitted');assert.equal(expired.reason,'approval_expired');assert.equal(stored.status,'failed');assert.equal(stored.metadata.paymentState,'not_submitted')
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{},approvalDeps)).status,'not_submitted','terminal unsubmitted record stays retired after app restart')
stored={...record,metadata:{...record.metadata,challengeId:'unknown-challenge'}}
const unknown=await reconcileUsdtBridge('owner',quoteToken,{},approvalDeps);assert.equal(unknown.requiresWalletSession,true);assert.equal(stored.status,'submitted','missing hash or expired quote alone cannot clear an unknown payment')
console.log('PASS verified unsubmitted approval retirement and missing-session recovery requirement')
// Cash handoff must preserve actual net delivery, including across restarts.
for(const [label,change,expected] of [
 ['net output',r=>({...r,logs:[transfer(tokenOut,USDT_BRIDGE_ROUTER,recipient,1000000n),transfer(tokenOut,recipient,wallet,4000n)]}),'completed'],
 ['wrong receipt',r=>({...r,transactionHash:txHash}),'pending'],
 ['removed log',r=>({...r,logs:r.logs.map(log=>({...log,removed:true}))}),'pending'],
 ['reorg',r=>({...r,blockHash:'0x'+'55'.repeat(32)}),'pending'],
 ['net below minimum',r=>({...r,logs:[...r.logs,transfer(tokenOut,recipient,wallet,1n)]}),'pending'],
]){
 stored=structuredClone(record)
 const receipt=change(destinationReceipt)
 const result=await reconcileUsdtBridge('owner',quoteToken,{txHash},{...deps,client:network=>({...deps.client(network),getTransactionReceipt:async()=>network==='arbitrum'?sourceReceipt:receipt})})
 assert.equal(result.status,expected,label)
 if(expected==='completed'){
  assert.equal(result.amountOut,'0.996');assert.equal(stored.metadata.settledAmountUnits,'996000')
  const replay=await reconcileUsdtBridge('owner',quoteToken,{},deps)
  assert.equal(replay.amountOut,'0.996');assert.deepEqual(replay.settlement,result.settlement)
 }else assert.equal(result.settlement,undefined,label+' cannot fund a conversion')
}
stored=structuredClone(record)
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{txHash},{...deps,client:network=>({...deps.client(network),getChainId:async()=>1})})).status,'needs_attention')
stored={...record,status:'completed',metadata:{...record.metadata,destinationTxHash}}
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{},deps)).amountOut,undefined,'old completion never substitutes its quote for actual output')
console.log('PASS Cash bridge handoff: exact net output, durable replay, canonical block/chain/hash, removed-log rejection and legacy unknown output.')
// Retiring an expired draft must win a journal claim before it can report no debit.
stored=null;let retiredClaims=0
const retireDeps={...deps,claimAction:async input=>{retiredClaims++;stored={...record,...input,status:'started'};return{claimed:true,record:stored}}}
const retired=await reconcileUsdtBridge('owner',quoteToken,{retireUnsubmitted:true},retireDeps)
assert.equal(retired.reason,'approval_expired');assert.equal(retiredClaims,1);assert.equal(stored.status,'failed')
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{retireUnsubmitted:true},retireDeps)).reason,'approval_expired');assert.equal(retiredClaims,1)
stored=null
const racing=await reconcileUsdtBridge('owner',quoteToken,{retireUnsubmitted:true},{...deps,readActivity:async()=>[],claimAction:async()=>{stored={...record,metadata:{...record.metadata,challengeId:'in-flight'}};return{claimed:false,record:stored}}})
assert.equal(racing.status,'pending');assert.equal(stored.status,'submitted','a concurrent source submission cannot be retired')
console.log('PASS expired pre-submit Cash draft retirement is atomic with a racing source execution.')
