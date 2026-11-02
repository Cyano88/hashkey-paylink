import assert from 'node:assert/strict'
import {generateKeyPairSync,sign} from 'node:crypto'
import {createWalletEventWebhook,walletEventKey} from '../api/pocket/wallet-event-inbox.ts'
import {verifyWalletEvent} from '../api/pocket/wallet-event-proof.ts'
const {privateKey,publicKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const id='11111111-1111-4111-8111-111111111111',walletId='22222222-2222-4222-8222-222222222222',keyId='33333333-3333-4333-8333-333333333333'
const store=new Map();let fail=false
const handler=createWalletEventWebhook({key:async()=>publicKey,save:async e=>{if(fail)throw Error('db');if(!store.has(walletEventKey(e)))store.set(walletEventKey(e),e)},now:()=>123})
const payload={notificationType:'transactions.inbound',notification:{id,walletId,blockchain:'BASE',state:'COMPLETE'}}
async function send(body=payload,tamper=false){const raw=Buffer.from(JSON.stringify(body)),sig=sign('sha256',raw,privateKey).toString('base64');const res={code:0,setHeader(){},status(n){this.code=n;return this},json(){return this},end(){return this}};await handler({method:'POST',headers:{'x-circle-key-id':keyId,'x-circle-signature':sig},body:tamper?Buffer.concat([raw,Buffer.from(' ')]):raw},res);return res.code}
assert.equal(await send(payload,true),401);assert.equal(store.size,0)
assert.equal(await send(),200);assert.equal(await send(),200);assert.equal(store.size,1)
fail=true;assert.equal(await send(),503);fail=false
assert.equal(await send({...payload,notification:{...payload.notification,state:'QUEUED'}}),200)
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64),address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),topic=a=>'0x'+a.slice(2).padStart(64,'0')
const link={privyUserId:'owner',chain:'base',circleWalletId:walletId,circleWalletAddress:address,circleBlockchain:'BASE',updatedAt:0}
let circle={id,walletId,blockchain:'BASE',state:'COMPLETE',txHash:hash},changed=false,unfinal=false,reads=0
const token='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'
const log={address:token,transactionHash:hash,blockNumber:'0x10',blockHash,logIndex:'0x0',data:'0x'+(1000000n).toString(16).padStart(64,'0'),topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',topic(other),topic(address)]}
const deps={fetch:async()=>Response.json({data:{transaction:circle}}),read:async(_network,method,params)=>{reads++;if(method==='eth_getTransactionReceipt')return {transactionHash:hash,status:'0x1',blockNumber:'0x10',blockHash};if(method==='eth_getBlockByNumber')return {number:params[0]==='latest'?(unfinal?'0xf':'0x20'):'0x10',hash:changed?'0x'+'c'.repeat(64):blockHash,timestamp:'0x6553f100'};if(method==='eth_getLogs')return [log];throw Error(method)}}
const event={walletId,transactionId:id,blockchain:'BASE',receivedAt:0,nextAt:0,attempts:0}
const rows=await verifyWalletEvent(event,link,deps);assert.equal(rows.length,1);assert.equal(rows[0].amount,'1');assert.equal(rows[0].direction,'in')
circle={...circle,walletId:id};reads=0;await assert.rejects(verifyWalletEvent(event,link,deps));assert.equal(reads,0)
circle={...circle,walletId,state:'CONFIRMED'};await assert.rejects(verifyWalletEvent(event,link,deps));assert.equal(reads,0)
circle={...circle,state:'COMPLETE'};changed=true;await assert.rejects(verifyWalletEvent(event,link,deps),/changed/);changed=false;unfinal=true;await assert.rejects(verifyWalletEvent(event,link,deps),/confirmation/)
console.log('PASS signed raw-body validation, duplicate inbox identity, storage retry, authenticated owner/state binding, confirmed canonical proof and exact transfer rows')

const {mergeWalletEventPushes}=await import('../api/pocket/wallet-event-push.ts')
const saved=mergeWalletEventPushes(undefined,[{eventId:'a'},{eventId:'b'}]);assert.equal(Object.keys(mergeWalletEventPushes(saved,[{eventId:'a'}])).length,2)
assert.throws(()=>mergeWalletEventPushes(Object.fromEntries(Array.from({length:1000},(_,i)=>[String(i),{eventId:String(i)}])),[{eventId:'new'}]),/full/)
console.log('PASS bounded idempotent durable event push queue')
