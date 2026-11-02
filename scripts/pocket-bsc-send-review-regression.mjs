import assert from 'node:assert/strict'
import {createBscSendClient} from '../src/pocket/lib/pocketBscSendClient.ts'
import {bscSendRequest,validateBscSend,BSC_SEND_REVIEW_TTL_MS} from '../src/pocket/lib/pocketBscSend.ts'
import {createBscSendFeeEstimator} from '../api/pocket/bsc-send-fee-estimator.ts'
import {createBscRuntime} from '../api/pocket/bsc-runtime.ts'
const now=Date.now(),q={version:1,chainId:56,id:'11111111-1111-4111-8111-111111111111',transferId:'sendb_'+'1'.repeat(24),ownerId:'payer',walletId:'wallet12345678',walletAddress:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),asset:'USDT',amountUnits:'4000000000000000000',reimbursementUnits:'20000000000000000',issuedAt:now,expiresAt:now+BSC_SEND_REVIEW_TTL_MS}
const reorder=v=>Array.isArray(v)?v.map(reorder):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).reverse().map(k=>[k,reorder(v[k])])):v
assert.notEqual(JSON.stringify(q),JSON.stringify(reorder(q)),'Old string equality rejects a jsonb roundtrip')
for(const mutation of [null,{amountUnits:'1'},{reimbursementUnits:'1'},{recipient:'0x'+'3'.repeat(40)},{extra:true}]){
 let signs=0,submits=0
 const client=createBscSendClient({appId:'app123',owner:q.ownerId,identity:async()=>q.walletAddress,sign:async()=>{signs++;return 'fixture'},request:async b=>{
  if(b.action==='prepare')return {operationId:q.id,state:'prepared',quote:reorder({...q,...mutation}),request:reorder(bscSendRequest(q,'app123'))}
  if(b.action==='submit'){submits++;return {operationId:q.id,state:'pending',quote:reorder(q)}}
  throw Error('Unexpected request')
 }})
 const execute=()=>client.execute({quote:q,quoteToken:'fixture',balanceUnits:'5180000000000000000'},'fixture',()=>{})
 if(mutation){await assert.rejects(execute);assert.equal(signs+submits,0)}else{assert.equal((await execute()).state,'pending');assert.equal(signs,1);assert.equal(submits,1)}
}
validateBscSend(q,now+90000)
assert.throws(()=>validateBscSend(q,q.expiresAt),/expired/)
assert.throws(()=>validateBscSend({...q,expiresAt:now+BSC_SEND_REVIEW_TTL_MS+1},now))
validateBscSend(q,q.expiresAt+1,true)
let age=25000
const rpc=async method=>({eth_chainId:'0x38',eth_getCode:'0xef0100d6cedde84be40893d153be9d467cd6ad37875b28',eth_call:'0x0',eth_estimateUserOperationGas:{callGasLimit:'0x186a0',verificationGasLimit:'0xc350',preVerificationGas:'0x5208'},rundler_getUserOperationGasPrice:{suggested:{maxFeePerGas:'0x3b9aca00'},blockNumber:'0x10'},eth_gasPrice:'0x3b9aca00',eth_getBlockByNumber:{number:'0x10',hash:'0x'+'a'.repeat(64),timestamp:'0x'+Math.floor((now-age)/1000).toString(16)}})[method]
const estimate=createBscSendFeeEstimator({rpc,now:()=>now,prices:async()=>({bnb:{scaled8:80000000000n,observedAt:now-age},stable:{scaled8:100000000n,observedAt:now-age}}),policy:{providerBps:0,providerAllowanceUsdMicros:0n,marginBps:2500,minimumFeeUnits:1n,maximumFeeUnits:10n**18n}})
assert.equal((await estimate(q)).expiresAt,q.expiresAt,'Fresh evidence must not consume the review window')
age=30001;await assert.rejects(()=>estimate(q),'Stale evidence remains rejected')
const env={PRIVATE_RPC_URL_BSC:'https://rpc.invalid',POCKET_XLAYER_FEE_POLICY:'observed_cost',POCKET_XLAYER_OBSERVED_COST_USD_MICROS:'0',POCKET_XLAYER_FEE_MARGIN_BPS:'2500',POCKET_XLAYER_MIN_FEE_UNITS:'10000',POCKET_XLAYER_MAX_FEE_UNITS:'1000000'}
for(const message of ['BEP20: transfer amount exceeds balance','ERC20: transfer amount exceeds balance','secret upstream detail']){
 const runtime=createBscRuntime(env,async(_url,options)=>Response.json({id:JSON.parse(options.body).id,error:{code:-32521,message}}))
 await assert.rejects(()=>runtime.rpc('eth_estimateUserOperationGas',[]),e=>message.startsWith('secret')?e.message==='BSC connection is temporarily unavailable.':e.status===422&&e.code==='insufficient_balance')
}
console.log('PASS BNB review regression: jsonb key order, immutable debit/recipient, bounded review TTL, stale-evidence rejection and sanitized insufficient balance.')
