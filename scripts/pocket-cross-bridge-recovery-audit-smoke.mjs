import assert from 'node:assert/strict'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {recoverCrossBridgeCircleHash} from '../api/pocket/cross-bridge-circle-recovery.ts'
import {createCrossBridgeWorker} from '../api/pocket/cross-bridge-worker.ts'
const {q,i}=fixture('base','arbitrum','USDC','USDT'),route=validateCrossBridgeRelayQuote(q,i,now),hash='0x'+'a'.repeat(64),out='0x'+'b'.repeat(64)
const review={route,quote:{id:'op',ownerId:'owner',input:i,wallets:{source:{provider:'circle'}}}}
const original={id:'op',ownerId:'owner',source:'base',walletAddress:i.sender,state:'pending',quoteToken:'sealed',fingerprint:'binding'}
const evidence={status:{status:'success',originChainId:8453,destinationChainId:42161,inTxHashes:[hash],txHashes:[out]},requests:{requests:[{id:route.requestId,protocol:{orderId:route.orderId,hubType:'onchain'},status:'success',user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:hash,chainId:8453,status:'success'}],outTxs:[{txHash:out,chainId:42161,status:'success'}]}}]}}
let row,proof='confirmed',provider,proven=0
const reset=()=>{row={...original};provider=structuredClone(evidence);proof='confirmed';proven=0};reset()
const deps={provider:async()=>provider,prove:async()=>{proven++;return proof},store:{mutate:async(_,fn)=>row=fn(row)}}
assert.equal((await recoverCrossBridgeCircleHash(row,review,deps)).sourceHash,hash);assert.equal(row.state,'submitted')
reset();proof='pending';await recoverCrossBridgeCircleHash(row,review,deps);assert.equal(row.sourceHash,undefined)
reset();provider.requests.requests[0].user='0x'+'f'.repeat(40);await recoverCrossBridgeCircleHash(row,review,deps);assert.equal(proven,0)
reset();deps.prove=async()=>{row={...row,state:'cancelled'};return 'confirmed'};await recoverCrossBridgeCircleHash(row,review,deps);assert.equal(row.state,'cancelled');assert.equal(row.sourceHash,undefined)
reset();deps.prove=async()=>{row={...row,fingerprint:'changed'};return 'confirmed'};await assert.rejects(()=>recoverCrossBridgeCircleHash({...row},review,deps))
const visited=new Set(),rows=Array.from({length:51},(_,n)=>({...original,id:String(n),sourceHash:hash,updatedAt:n,state:'submitted'}))
const worker=createCrossBridgeWorker({durable:()=>true,list:async()=>rows,open:async()=>review,reconcile:async(_,id)=>{visited.add(id);throw Error('proof unavailable')}})
await worker();assert.equal(visited.size,50);await worker();assert.equal(visited.size,51)
let recovered=0,settled=0
await createCrossBridgeWorker({durable:()=>true,list:async()=>[{...original}],open:async()=>review,recoverCircle:async op=>{recovered++;return {...op,sourceHash:hash}},reconcile:async()=>{settled++}})();assert.equal(recovered,1);assert.equal(settled,1)
console.log('PASS app-independent Circle hash recovery, strict provider identity, mandatory source proof, mutation races, worker wiring, and fairness beyond50 pending operations. No dispatch.')
