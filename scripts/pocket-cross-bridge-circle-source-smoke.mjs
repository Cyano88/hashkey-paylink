import assert from 'node:assert/strict'
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {proveCrossBridgeCircleSource,readCrossBridgeCircleSourceState} from '../api/pocket/cross-bridge-circle-source.ts'
import {RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
const secret='cross-circle-source-fixture'.repeat(3),treasury='0x3333333333333333333333333333333333333333',hash='0x'+'1'.repeat(64)
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
for(const [source,asset] of [['base','ETH'],['base','USDC'],['ethereum','USDT'],['arbitrum','ETH'],['polygon','USDC'],['arc','USDC']]){
 const {q,i}=fixture(source,source==='base'?'polygon':'base',asset,'USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:source,provider:'circle',walletId:'source',address:i.sender},destination:{network:i.destination,provider:'circle',walletId:'dest',address:i.recipient}}
 wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const charged=await buildCrossBridgeChargedPlan(route,wallets,123n,treasury)
 const saved=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:treasury,...charged,expiresAt:now+30000},{secret,now})
 const review=await openCrossBridgeReview(saved.quoteToken,'owner',{secret,now})
 const log=(to,value)=>({address:route.tokenIn.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:i.sender,to}}),data:encodeAbiParameters([{type:'uint256'}],[value]),removed:false})
 const receipt={status:'success',transactionHash:hash,logs:route.tokenIn.native?[]:[log(RELAY_BSC_CHAINS[source].depository,BigInt(i.amountUnits)),log(treasury,123n)]}
 const trace={type:'CALL',to:i.sender,input:charged.plan.callData,calls:charged.plan.calls.map(c=>({type:'CALL',from:i.sender,to:c.target,input:c.data,value:'0x'+c.value.toString(16)}))}
 assert.equal(proveCrossBridgeCircleSource(review,hash,receipt,trace).sourceConfirmed,true)
 const probes=structuredClone(trace)
 probes.calls.unshift({type:'STATICCALL',from:i.sender,to:route.tokenIn.address,input:'0x01ffc9a7',error:'execution reverted',calls:[{type:'DELEGATECALL',error:'execution reverted'}]})
 assert.equal(proveCrossBridgeCircleSource(review,hash,receipt,probes).sourceConfirmed,true)
 const failedCall=structuredClone(probes);failedCall.calls[0].type='CALL'
 assert.throws(()=>proveCrossBridgeCircleSource(review,hash,receipt,failedCall))
 const blockHash='0x'+'b'.repeat(64)
 let failedTrace={...trace,error:'execution reverted'}
 const rpc=async({method})=>{
  if(method==='eth_chainId')return '0x'+BigInt(RELAY_BSC_CHAINS[source].id).toString(16)
  if(method==='eth_getBlockByNumber')return {hash:blockHash,number:'0x10',transactions:[hash]}
  if(method==='eth_getTransactionReceipt')return {status:'0x0',transactionHash:hash,blockHash,blockNumber:'0x10',transactionIndex:'0x0',logs:[]}
  if(method==='debug_traceTransaction')return failedTrace
  throw Error(method)
 }
 assert.equal(await readCrossBridgeCircleSourceState(review,hash,rpc),'failed')
 failedTrace={...failedTrace,input:'0x'}
 await assert.rejects(()=>readCrossBridgeCircleSourceState(review,hash,rpc))
 for(const mutate of [t=>t.error='reverted',t=>t.calls.pop(),t=>t.calls[0].value='0xffff',t=>t.calls.push(t.calls[0]),t=>t.calls[0].input='0x',t=>t.calls[0].error='reverted']){const t=structuredClone(trace);mutate(t);assert.throws(()=>proveCrossBridgeCircleSource(review,hash,receipt,t))}
 assert.throws(()=>proveCrossBridgeCircleSource(review,hash,{...receipt,status:'reverted'},trace))
 assert.throws(()=>proveCrossBridgeCircleSource(review,'0x'+'2'.repeat(64),receipt,trace))
 if(!route.tokenIn.native){
  assert.throws(()=>proveCrossBridgeCircleSource(review,hash,{...receipt,logs:receipt.logs.slice(0,1)},trace))
  assert.throws(()=>proveCrossBridgeCircleSource(review,hash,{...receipt,logs:[receipt.logs[0],log(treasury,122n)]},trace))
  assert.throws(()=>proveCrossBridgeCircleSource(review,hash,{...receipt,logs:[...receipt.logs,log(treasury,1n)]},trace))
 }
}
console.log('PASS Circle cross-bridge exact source proofs: native/token plans, missing/altered/extra/reverted calls, wrong hash, missing/incorrect/extra debit and fee logs. Synthetic evidence, not live settlement.')
