import assert from 'node:assert/strict'
import {createBscSendClient} from '../src/pocket/lib/pocketBscSendClient.ts'
import {bscSendRequest} from '../src/pocket/lib/pocketBscSend.ts'
const q={version:1,chainId:56,id:'11111111-1111-4111-8111-111111111111',transferId:'sendb_'+'1'.repeat(24),ownerId:'payer',walletId:'wallet12345678',walletAddress:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),asset:'USDC',amountUnits:'1000000000000000001',reimbursementUnits:'10000000000000000',issuedAt:Date.now(),expiresAt:Date.now()+30000}
const review={quote:q,quoteToken:'sealed',balanceUnits:'10000000000000000000'}
function fixture(){const s={calls:[],signs:0,state:'prepared',signatureError:false,submitError:false,changed:false,wallet:q.walletAddress,quote:q};const d={appId:'app123',owner:q.ownerId,identity:async()=>s.wallet,sign:async()=>{s.signs++;if(s.signatureError)throw Error('Cancelled');return 'signature'},request:async b=>{s.calls.push(b.action);if(b.action==='quote')return {...review,quote:s.quote};if(b.action==='prepare')return {operationId:q.id,state:s.state,quote:q,request:s.changed?{}:bscSendRequest(q,'app123')};if(b.action==='cancel')return {operationId:q.id,state:'cancelled',quote:q};if(b.action==='status')return {operationId:q.id,state:s.state,quote:q};if(b.action==='submit'){if(s.submitError)throw Error('Timeout');return {operationId:q.id,state:'pending',quote:q}};throw Error('Unexpected')}};return {s,client:createBscSendClient(d)}}
let f=fixture();assert.equal((await f.client.quote('USDC',q.recipient,'1.000000000000000001')).quote.amountUnits,q.amountUnits)
f.s.quote={...q,amountUnits:'1'};await assert.rejects(()=>f.client.quote('USDC',q.recipient,'1.000000000000000001'))
f=fixture();f.s.changed=true;assert.equal((await f.client.execute(review,'pin',()=>{})).state,'cancelled');assert.equal(f.s.signs,0);assert(!f.s.calls.includes('submit'))
f=fixture();f.s.signatureError=true;assert.equal((await f.client.execute(review,'pin',()=>{})).state,'cancelled');assert(!f.s.calls.includes('submit'))
f=fixture();let saved=false;f.s.submitError=true;await assert.rejects(()=>f.client.execute(review,'pin',()=>{saved=true}),/Timeout/);assert(saved);f.s.state='pending';await f.client.recover(q.id);assert.equal(f.s.calls.filter(x=>x==='submit').length,1);assert.equal(f.s.signs,1)
f=fixture();await f.client.recover(q.id);assert.deepEqual(f.s.calls,['status','cancel']);assert.equal(f.s.signs,0)
f=fixture();f.s.wallet=q.recipient;await assert.rejects(()=>f.client.execute(review,'pin',()=>{}));assert.deepEqual(f.s.calls,[])
console.log('PASS BNB send client: exact review, canonical signing, cancellation, owner switch, persist-before-prepare and status-only timeout recovery; no live funds.')
