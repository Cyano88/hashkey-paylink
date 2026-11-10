import {POCKET_USDT_ASSETS} from '../src/pocket/lib/pocketUsdtAssets.ts'
﻿import assert from 'node:assert/strict'
import { createPaymentFeeQuote } from '../api/payment-fee-quotes.ts'
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
import { decodeFunctionData, parseAbi } from 'viem'
mkdirSync('.codex-temp', {recursive:true})
const mocks = {
 './evm-read.js': `export const readEvmRpc=async()=> '0x'+BigInt(globalThis.fixtureBalance??10000000000n).toString(16).padStart(64,'0')`,
 './paycrest-pos.js': `export const getPaycrestPosOrder=async()=>globalThis.fixturePayout`,
 './privy-circle-link.js': `export const circleLinkKey=()=>''; export const readCircleLink=async()=>null; export const findPaymentCircleLinkByWallet=async()=>globalThis.fixturePayout?.source==='hosted-checkout'?{privyUserId:'fixture-buyer'}:null; export const verifiedPrivyUser=async()=>{if(globalThis.fixturePayout?.source==='hosted-checkout')return{userId:'fixture-buyer'};throw Error('Unexpected Pocket identity lookup')}`,
 './checkout-buyer-allowance.js': `export const checkCheckoutBuyerAllowance=async(owner,order,checkOnly)=>{globalThis.allowanceCalls.push({owner,checkOnly});if(globalThis.allowanceDenied)throw Object.assign(Error('Checkout daily limit reached'),{status:403,code:'CHECKOUT_DAILY_LIMIT'})};export const checkoutPaymentExecutionKey=()=> '44444444-4444-4444-a444-444444444444'`,
 './pocket/payment-security.js': `export const requiresPocketPaymentApproval=async()=>{if(globalThis.fixturePayout?.source==='hosted-checkout')return false;throw Error('Unexpected approval lookup')}; export const consumePocketPaymentApproval=async()=>false`,
 './pocket/wallet-migration-guard.js': `export const withOrdinaryWalletMutation=async(id,run)=>run()`,
}
await build({entryPoints:['api/circle-solana-email.ts'],outfile:'.codex-temp/circle-payment-retry-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'mock',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path] && (a.path!=='./paycrest-pos.js'||a.importer.endsWith('circle-solana-email.ts'))?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'js'}))}}]})
process.env.CIRCLE_API_KEY='mock-only-no-network'
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-only-quote-secret-not-production-123456'
const {default:handler}=await import('../.codex-temp/circle-payment-retry-test.mjs')
const payer='0x1111111111111111111111111111111111111111', recipient='0x2222222222222222222222222222222222222222'
let blockchain='BASE', executions=[], deduplicated=new Map(), estimateCalls=0
const originalFetch=globalThis.fetch
// Every upstream call is intercepted: this test cannot submit a real transaction.
globalThis.fetch=async(url,init)=>{
 const path=new URL(url).pathname
 if(new URL(url).hostname==='api.coingecko.com')return Response.json({'polygon-ecosystem-token':{usd:0.5,last_updated_at:Math.floor(Date.now()/1000)},ethereum:{usd:3000,last_updated_at:Math.floor(Date.now()/1000)},'usd-coin':{usd:1,last_updated_at:Math.floor(Date.now()/1000)},tether:{usd:1,last_updated_at:Math.floor(Date.now()/1000)}})
 if(path==='/v1/w3s/transactions/contractExecution/estimateFee'){estimateCalls++;return Response.json({data:{high:{networkFeeRaw:'0.0001'}}})}
 if(path==='/v1/w3s/wallets/fixture-wallet')return Response.json({data:{wallet:{id:'fixture-wallet',address:payer,blockchain,accountType:'SCA',state:'LIVE'}}})
 assert.equal(path,'/v1/w3s/user/transactions/contractExecution')
 const body=JSON.parse(init.body); executions.push(body)
 const existing=deduplicated.get(body.idempotencyKey)
 if(existing)assert.deepEqual(body,existing.body)
 const result=existing??{body,challengeId:`challenge-${deduplicated.size+1}`}
 deduplicated.set(body.idempotencyKey,result)
 return Response.json({data:{challengeId:result.challengeId}})
}
const base={action:'executeEvmPayment',userToken:'fixture-session',walletId:'fixture-wallet',walletAddress:payer,chain:'base',recipient,totalUnits:'100000000',feeMode:'gross',idempotencyKey:'11111111-1111-4111-8111-111111111111'}
function quoteFor(request) { return createPaymentFeeQuote({asset:request.asset,chain:request.chain,walletId:request.walletId,walletAddress:request.walletAddress,recipient:request.recipient,amountUnits:request.totalUnits,mode:request.feeMode},800000n).token }
base.feeQuoteToken=quoteFor(base)
async function call(body,expected=200){let status=200,result;await handler({method:'POST',body,headers:{}},{status(s){status=s;return this},json(r){result=r;return this}});assert.equal(status,expected,JSON.stringify(result));return result}
try {
 const priced=await call({...base,action:'quoteEvmPayment'})
 assert.equal(priced.quote.platformFeeUnits,'250000')
 assert.equal(priced.quote.networkFeeUnits,'300000')
 assert.equal(priced.quote.totalUnits,'100550000')
 assert.equal(estimateCalls,2)
 assert.equal(executions.length,0)
 await call({...base,action:'quoteEvmPayment',feeBps:'0'},400)
 const payoutRequest={...base,action:'quoteEvmPayment',feeBps:'0',payoutIntentId:'fixture-payout'}
 globalThis.fixturePayout={receive_address:recipient,refund_address:payer,amount_usdc:'100',status:'pending',valid_until:new Date(Date.now()+60000).toISOString()}
 const exempt=await call(payoutRequest)
 assert.equal(exempt.quote.totalUnits,'100000000')
 assert.equal(exempt.quote.platformFeeUnits,'0')
 assert.equal(exempt.quote.networkFeeUnits,'0')
 assert.equal(estimateCalls,2)
 globalThis.fixturePayout.refund_address=recipient
 await call(payoutRequest,400)
 globalThis.fixturePayout.refund_address=payer
 globalThis.fixturePayout.valid_until='invalid-date'
 await call(payoutRequest,400)
 delete globalThis.fixturePayout
 for(const [index,chain,network] of [[1,'base','BASE'],[2,'arbitrum','ARB'],[3,'arc','ARC'],[4,'ethereum','ETH'],[5,'polygon','MATIC']]){
  blockchain=network
  const request={...base,chain,idempotencyKey:`11111111-1111-4111-8111-11111111111${index}`}
  const actualQuote=await call({...request,action:'quoteEvmPayment'})
  assert.equal(actualQuote.quote.networkFeeUnits,chain==='polygon'?'50':chain==='arc'?'100':'300000')
  request.feeQuoteToken=quoteFor(request)
  const first=await call(request),retry=await call(request)
  assert.equal(first.challengeId,retry.challengeId)
  assert.deepEqual(first.approval,{amount:'100',total:'101.05',asset:'USDC'})
  assert.deepEqual(retry.approval,first.approval)
  assert.equal(executions.at(-1).idempotencyKey,request.idempotencyKey)
  const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:executions.at(-1).callData})
  assert.equal(batch.args[0].length,3)
  const transfer=decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns (bool)']),data:batch.args[0][0].data})
  assert.equal(transfer.args[0].toLowerCase(),recipient)
  assert.equal(transfer.args[1],100000000n)
  const fee=decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns (bool)']),data:batch.args[0][1].data})
  assert.equal(fee.args[1],250000n)
  const gas=decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns (bool)']),data:batch.args[0][2].data});assert.equal(gas.args[1],800000n);assert.equal(gas.args[0].toLowerCase(),'0xbf36a13d26df07dbb7a9a1eed1b5a575d4ada822')
  assert.equal(fee.args[0].toLowerCase(),'0xce5df9e1115f81a2fc2f65941b20b820d508e753')
 }
 assert.equal(deduplicated.size,5)
 const count=executions.length
 blockchain='BASE';globalThis.fixtureBalance=100000000n
 await call(base,400)
 assert.equal(executions.length,count,'insufficient balance must not open a Circle challenge')
 delete globalThis.fixtureBalance
 await call({...base,idempotencyKey:'invalid'},400)
 await call({...base,idempotencyKey:''},400)
 await call({...base,feeQuoteToken:''},409)
 await call({...base,totalUnits:'200000000'},409)
 await call({...base,feeQuoteToken:base.feeQuoteToken+'invalid'},409)
 blockchain='ETH'
 await call(base,403)
 assert.equal(executions.length,count)
 for(const [index,chain,network] of [[1,'base','BASE'],[2,'arbitrum','ARB'],[3,'ethereum','ETH'],[4,'polygon','MATIC']]){
  blockchain=network
  const request={...base,asset:'USDT',chain,idempotencyKey:`22222222-2222-4222-8222-22222222222${index}`}
  const priced=await call({...request,action:'quoteEvmPayment'})
  assert.equal(priced.quote.asset,'USDT')
  assert.equal(priced.quote.platformFeeUnits,'250000')
  request.feeQuoteToken=priced.token
  const before=executions.length
  await call({...request,asset:'USDC'},409)
  await call({...request,feeQuoteToken:quoteFor({...request,asset:'USDC'})},409)
  assert.equal(executions.length,before)
  const result=await call(request)
  assert.equal(result.approval.asset,'USDT')
  const batch=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:executions.at(-1).callData})
  assert(batch.args[0].every(call=>call.target.toLowerCase()===POCKET_USDT_ASSETS[chain].address.toLowerCase()))
  assert.equal(batch.args[0].length,3)
 }
 blockchain='ARC'
 await call({...base,asset:'USDT',chain:'arc'},400)
 blockchain='BASE'
 await call({...base,asset:'USDT',action:'quoteEvmPayment',feeBps:'0',payoutIntentId:'fixture-payout'},400)

 for(const [index,chain,network] of [[1,'base','BASE'],[2,'arbitrum','ARB'],[3,'arc','ARC'],[4,'ethereum','ETH'],[5,'polygon','MATIC']])for(const asset of chain==='arc'?['USDC']:['USDC','USDT']){
  blockchain=network
  const request={...base,chain,asset,action:'executeEvmSend',idempotencyKey:('33333333-3333-4333-8333-3333333333'+(asset==='USDC'?'1':'2')+index)}
  const priced=await call({...request,action:'quoteEvmSend'})
  assert.equal(priced.quote.purpose,'wallet-send');assert.equal(priced.quote.platformFeeUnits,'0');assert.equal(priced.quote.feeBps,0)
  assert(BigInt(priced.quote.networkFeeUnits)>0n);assert.equal(priced.quote.treasuryUnits,priced.quote.networkFeeUnits)
  request.feeQuoteToken=priced.token
  await call({...request,action:'executeEvmPayment'},409)
  await call({...request,feeQuoteToken:quoteFor(request)},409)
  await call(request)
  const calls=decodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),data:executions.at(-1).callData}).args[0]
  assert.equal(decodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount) returns(bool)']),data:calls[1].data}).args[1],BigInt(priced.quote.networkFeeUnits))
 }
 blockchain='BASE';globalThis.allowanceCalls=[]
 globalThis.fixturePayout={source:'hosted-checkout',intent_id:'hosted1',paycrest_order_id:'provider1',receive_address:recipient,refund_address:payer,amount_usdc:'100',status:'initiated',valid_until:new Date(Date.now()+600000).toISOString()}
 const hosted={...base,feeBps:'0',payoutIntentId:'hosted1'}
 hosted.feeQuoteToken=(await call({...hosted,action:'quoteEvmPayment'})).token
 const beforeHosted=executions.length
 globalThis.allowanceDenied=true;await call(hosted,403);assert.equal(executions.length,beforeHosted);globalThis.allowanceDenied=false
 const firstHosted=await call(hosted),secondHosted=await call({...hosted,idempotencyKey:'55555555-5555-4555-8555-555555555555'})
 assert.equal(firstHosted.challengeId,secondHosted.challengeId)
 assert.equal(executions.at(-1).idempotencyKey,'44444444-4444-4444-a444-444444444444')
 assert.equal(globalThis.allowanceCalls.filter(c=>c.checkOnly===false).length,2)
 assert(globalThis.allowanceCalls.every(c=>c.owner==='fixture-buyer'))
 console.log('PASS: hosted checkout checks and reserves verified buyer allowance before signing; over-limit creates no challenge and changed client retry keys still use one server-bound execution.')
 console.log('PASS: wallet sends on all five EVM rails retain gas only; payment/send quote crossover rejected for both assets.')
 console.log('PASS: USDT batch recipient and fee use exact pinned contracts; cross-asset quotes, Arc and USDC-only payout exemptions rejected.')
 console.log('PASS: five configured EVM rails preserve retry key and exact gross recipient; invalid keys and wrong-chain wallet submit nothing. Provider deduplication is mocked, not a live guarantee.')
}finally{globalThis.fetch=originalFetch}
