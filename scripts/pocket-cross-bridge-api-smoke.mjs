import assert from 'node:assert/strict'
import {createCrossBridgeHandler} from '../api/pocket/cross-bridge-api.ts'
import {createCrossBridgeWorker} from '../api/pocket/cross-bridge-worker.ts'
const owner='owner',token='sealed',id='bridge-id'
let enabled=true,identity=owner,op,submitted=0,signed=0,reconciled=0
const review={quote:{id,ownerId:owner,input:{source:'solana'},wallets:{source:{provider:'circle'}}}}
const response=async r=>({ok:true,status:r.state,quoteToken:r.quoteToken})
const store={read:async()=>op,mutate:async(_id,fn)=>op=await fn(op)}
const runtime=()=>({prepare:async()=>op={id,ownerId:owner,quoteToken:token,state:'prepared',updatedAt:0},submit:async()=>{submitted++;return op={...op,state:'pending'}},signed:async()=>{signed++;return op={...op,sourceHash:'hash',state:'submitted'}},status:async()=>op,broadcast:async()=>op})
const handler=createCrossBridgeHandler({identity:async()=>({userId:identity}),durable:()=>true,enabled:()=>enabled,open:async(t,o)=>{assert.equal(t,token);assert.equal(o,owner);return review},store,runtime,list:async()=>op?[op]:[],response,reconcile:async()=>{reconciled++;return op}})
async function call(action,extra={}){let code=200,data;await handler({method:'POST',body:{action,quoteToken:token,...extra},headers:{}},{setHeader(){},status(n){code=n;return this},json(v){data=v;return this}});return {code,data}}
assert.equal((await call('nonsense')).code,400)
enabled=false;assert.equal((await call('prepare')).code,409);enabled=true
await call('prepare');assert.equal((await call('status')).data.status,'prepared');assert.equal(op.state,'prepared','Status must not cancel a bridge awaiting submission');assert.equal(submitted,0)
await call('prepare');await call('submit');assert.equal(submitted,1)
assert.equal((await call('cancel')).data.status,'cancelled');assert.equal(signed,0)
await call('prepare');await call('submit');await call('signed',{signedTransaction:'signed-by-owner'});assert.equal(signed,1);assert.equal(reconciled,1)
assert.equal((await call('cancel')).data.status,'submitted')
enabled=false;assert.equal((await call('status')).code,200);assert.equal(reconciled,2)
identity='another-owner';assert.equal((await call('status')).code,409);identity=owner
let broadcasts=0,reads=0,settlements=0
const worker=createCrossBridgeWorker({durable:()=>true,list:async()=>[{...op,id:'first',sourceHash:'one'},{...op,id:'second',sourceHash:'two'},{...op,id:'unsigned',state:'prepared'}],open:async()=>review,runtime:()=>({broadcast:async key=>{broadcasts++;return {...op,id:key,sourceHash:key}}}),reconcile:async()=>{settlements++;if(settlements===1)throw Error('temporarily unavailable')}})
await worker();assert.equal(broadcasts,2);assert.equal(settlements,2)
const privyWorker=createCrossBridgeWorker({durable:()=>true,list:async()=>[{...op,sourceHash:undefined}],open:async()=>({quote:{input:{source:'bsc'},wallets:{source:{provider:'privy'}}}}),runtime:()=>({status:async()=>{reads++;return {...op,sourceHash:'proven'}}}),reconcile:async()=>{settlements++}})
await privyWorker();assert.equal(reads,1);assert.equal(settlements,3)
const repairWorker=createCrossBridgeWorker({durable:()=>true,list:async()=>[{...op,state:'completed'},{...op,state:'completed',ledgerPublishedAt:1}],open:async()=>({quote:{input:{source:'base'},wallets:{source:{provider:'circle'}}}}),reconcile:async()=>{settlements++}})
await repairWorker();assert.equal(settlements,4,'Terminal proof without published ledger is repaired after restart')
console.log('PASS API rollout gate, owner binding, unsigned cancellation, signed retention, disabled-route recovery, and worker failure isolation. No provider dispatch.')
