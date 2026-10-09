import assert from 'node:assert/strict'
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
const destinationReceipt={status:'success',logs:[transfer(tokenOut,USDT_BRIDGE_ROUTER,recipient,994438n)]}
const record={id:'record',ownerId:'owner',action:'wallet.usdt-bridge',status:'submitted',metadata:{quoteToken},updatedAt:Date.now()}
let stored=record,ledger=[],writes=[]
const deps={findAction:async()=>stored,recordAction:async input=>{writes.push(input);stored={...stored,...input};return stored},appendLedger:async input=>{ledger.push(input)},readActivity:async()=>[{assetSymbol:'USDT',direction:'out',ts:Date.now(),txHash}],client:network=>({getTransactionReceipt:async()=>network==='arbitrum'?sourceReceipt:destinationReceipt}),fetch:async()=>({ok:true,json:async()=>({status:'DONE',substatus:'COMPLETED',sending:{txHash},receiving:{chainId:'8453',txHash:destinationTxHash}})})}
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{},deps)).status,'completed','lost SDK hash must recover from exact onchain quote event')
assert.equal(ledger[0].asset,'USDT');assert.equal(stored.metadata.destinationTxHash,destinationTxHash)
await reconcileUsdtBridge('owner',quoteToken,{},deps);assert.equal(ledger.length,2,'completed records retry idempotent ledger append')
stored=record
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{txHash},{...deps,client:network=>({getTransactionReceipt:async()=>network==='arbitrum'?sourceReceipt:{status:'success',logs:[transfer(tokenIn,USDT_BRIDGE_ROUTER,recipient,994438n)]}})})).status,'pending','wrong destination asset cannot complete bridge')
stored=record
assert.equal((await reconcileUsdtBridge('owner',quoteToken,{}, {...deps,client:()=>({getTransactionReceipt:async()=>({status:'success',logs:[]})})})).status,'pending','unrelated wallet debit cannot recover quote')
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
