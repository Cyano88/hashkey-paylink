import assert from 'node:assert/strict'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
import {inspectSolanaSupportTransaction,checkSupportStockTransaction} from '../api/pocket/support-asset-investigation.ts'
import {stockAssets,stockUsdc} from '../src/pocket/lib/pocketXStocksWallet.ts'
const owner='owner-fixture',now=Date.now(),wallet='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),signature='3'.repeat(88),solWallet='fixture-sol-wallet',mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const tok=(index,amount,address=solWallet,token=mint)=>({accountIndex:index,mint:token,owner:address,uiTokenAmount:{decimals:6,amount}})
const tx={slot:1,transaction:{signatures:[signature]},meta:{err:null,preTokenBalances:[tok(1,'0')],postTokenBalances:[tok(1,'1000000')]}}
assert.match(inspectSolanaSupportTransaction(tx,signature,solWallet).text,/1 USDC/)
for(const [patch,status]of [[null,'not_found'],[{...tx,transaction:{signatures:['wrong']}},'unavailable'],[{...tx,meta:{...tx.meta,err:{InstructionError:[0,'bad']}}},'unmatched'],[{...tx,meta:{...tx.meta,postTokenBalances:[tok(1,'1000000','someone-else')]}},'unmatched'],[{...tx,meta:{...tx.meta,postTokenBalances:[tok(1,'1000000',solWallet,'wrong-mint')]}},'unmatched'],[{...tx,meta:{...tx.meta,preTokenBalances:[tok(0,'1000000')],postTokenBalances:[tok(1,'1000000')]}},'unmatched']])assert.equal(inspectSolanaSupportTransaction(patch,signature,solWallet).status,status)
const asset=stockAssets[0],topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',to='0x'+wallet.slice(2).padStart(64,'0'),from='0x'+other.slice(2).padStart(64,'0')
const receipt={transactionHash:hash,status:'success',blockNumber:10n,blockHash,logs:[{address:asset.address,topics:[topic,from,to],data:'0x'+(1000000n).toString(16).padStart(64,'0')}]}
let stockReceipt=receipt,chain=196,canonical=blockHash
const client={getChainId:async()=>chain,getTransactionReceipt:async()=>stockReceipt,getBlock:async()=>({hash:canonical}),readContract:async()=>6,getTransaction:async()=>({hash,blockHash,to:other,from:other,value:0n})}
const stockDeps={wallet:async id=>{assert.equal(id,owner);return wallet},client:()=>client}
assert.equal((await checkSupportStockTransaction(owner,hash,stockDeps)).status,'included')
for(const patch of [{...receipt,logs:[{...receipt.logs[0],address:other}]},{...receipt,logs:[{...receipt.logs[0],topics:[topic,to,to]}]},{...receipt,status:'reverted'}]){stockReceipt=patch;assert.equal((await checkSupportStockTransaction(owner,hash,stockDeps)).status,'unmatched')}
stockReceipt=receipt;chain=1;assert.equal((await checkSupportStockTransaction(owner,hash,stockDeps)).status,'unavailable');chain=196;canonical='wrong';assert.equal((await checkSupportStockTransaction(owner,hash,stockDeps)).status,'unavailable')
const base={identity:{kind:'privy',subject:owner},profileId:'profile',requestId:'phase2-read-only-00001',newConversation:true,cases:{}}
let balanceCalls=[];const deps={profile:async()=>undefined,payments:async()=>[],now:()=>now,balanceCheck:async(id,network,asset)=>{balanceCalls.push({id,network,asset});return{text:'Verified '+asset+' balance on '+network}}}
const ask=async(q,prior,extra={})=>supportAccountAnswer({...base,question:q,...(prior?{caseId:'case',cases:{case:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',accountContext:prior.accountContext,options:prior.options}]}}}:{}),...extra},deps)
let a=await ask('My balance does not tally');a=await ask('USDC',a);assert.match(a.text,/Which network/);a=await ask('Base',a);assert.match(a.text,/Verified USDC balance/);assert.equal(balanceCalls.at(-1).id,owner)
a=await ask('My XStocks balance is wrong');assert.match(a.text,/ticker/);a=await ask('USDC',a);assert.match(a.text,/Verified usdc balance on xlayer/i);assert.equal(balanceCalls.at(-1).network,'xlayer')
const again=await ask('check again',a);assert.equal(balanceCalls.length,2);assert.match(again.text,/Verified/)
const failure=await supportAccountAnswer({...base,question:'My USDC balance on Base is wrong'},{...deps,balanceCheck:async()=>{throw Error('PRIVATE')}});assert.match(failure.text,/not replaced your balance with zero/);assert.ok(!failure.text.includes('PRIVATE'))
const bill={eventId:'pocket-bill:bill-one',source:'bills',billCategory:'airtime',chain:'base',amount:'0.74',amountNgn:'1000',fiatCurrency:'NGN',txHash:hash,ts:now-1000,payer:'fixture',memo:'',direction:'out',paycrestStatus:'pending'}
const selected={...base,question:'Check this payment',caseId:'case',selectedEventId:bill.eventId,cases:{case:{profileId:'profile',status:'waiting_user',humanSupport:false,updatedAt:now,messages:[{author:'agent',options:[{id:'payment_details',eventId:bill.eventId}]}]}}}
for(const status of ['delivered','pending','failed','reversed']){const result=await supportAccountAnswer(selected,{...deps,payments:async()=>[bill],billStatus:async(id,row)=>{assert.equal(id,owner);assert.equal(row.eventId,bill.eventId);return{status,checkedAt:now}}});assert.match(result.text,new RegExp('provider: '+status));if(status==='reversed')assert.match(result.text,/does not establish that USDC was refunded/)}
let foreignCalls=0;assert.equal(await supportAccountAnswer({...selected,profileId:'someone-else'},{...deps,billStatus:async()=>{foreignCalls++;throw Error()}}),undefined);assert.equal(foreignCalls,0)
console.log('PASS Solana credit/net-zero/ownership/mint/failure, XStocks owner/token/chain/canonical-block/self-transfer, balance routing/cache/error, bill delivery/reversal and cross-account denial')

// Direct native OKB credit and missing Solana ownership metadata.
canonical=blockHash;stockReceipt={...receipt,logs:[]};client.getTransaction=async()=>({hash,blockHash,to:wallet,from:other,value:1000000000000000000n})
assert.match((await checkSupportStockTransaction(owner,hash,stockDeps)).text,/1 OKB/)
client.getTransaction=async()=>({hash,blockHash,to:wallet,from:wallet,value:1n})
assert.equal((await checkSupportStockTransaction(owner,hash,stockDeps)).status,'unmatched')
assert.equal(inspectSolanaSupportTransaction({...tx,meta:{...tx.meta,postTokenBalances:[{...tok(1,'1'),owner:undefined}]}},signature,solWallet).status,'unavailable')
const {boundedSupportRead}=await import('../api/pocket/support-read-budget.ts')
let release,readCalls=0;const gate=new Promise(resolve=>release=resolve)
const tasks=Array.from({length:8},(_,i)=>boundedSupportRead('owner-a:'+i,async()=>{readCalls++;await gate;return i}))
const duplicate=boundedSupportRead('owner-a:0',async()=>{throw Error('Must coalesce')})
await assert.rejects(boundedSupportRead('owner-b:0',async()=>0),/busy/)
release();await Promise.all(tasks);assert.equal(await duplicate,0);assert.equal(readCalls,8)
assert.equal(await boundedSupportRead('owner-a:0',async()=>99),0)
assert.equal(await boundedSupportRead('owner-b:0',async()=>99),99)
await assert.rejects(boundedSupportRead('failure',async()=>{throw Error('no cache')}))
assert.equal(await boundedSupportRead('failure',async()=>42),42)
console.log('PASS direct OKB, Solana missing-owner guard, read concurrency/coalescing/cache/owner isolation and failure retry')
