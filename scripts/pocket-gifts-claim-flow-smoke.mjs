import assert from 'node:assert/strict'
import {createGiftClaimFlow} from '../src/pocket/features/gifts/giftClaimController.ts'
const hash='0x'+'a'.repeat(64)
const setup=()=>{
 let approved=0,prepared=0,result={status:'available'},failure=false,wait
 const states=[]
 const flow=createGiftClaimFlow({prepare:async()=>{prepared++;if(wait)await wait;return {}},approve:async()=>{approved++;if(failure)throw Error('timeout');return {transactionHash:hash}},status:async()=>result,changed:state=>states.push(state)})
 return {flow,states,get approved(){return approved},get prepared(){return prepared},set result(v){result=v},set failure(v){failure=v},set wait(v){wait=v}}
}
const a=setup();await a.flow.claim();assert.equal(a.flow.state.phase,'unconfirmed');assert.equal(a.states.some(s=>s.phase==='confirmed'),false)
await a.flow.claim();assert.equal(a.approved,1)
a.result={status:'confirmed',transactionHash:hash};await a.flow.recheck();assert.equal(a.flow.state.phase,'confirmed');assert.equal(a.approved,1)
const b=setup();b.failure=true;await b.flow.claim();assert.equal(b.flow.state.phase,'unconfirmed');await b.flow.recheck();assert.equal(b.approved,1)
const c=setup();let release;c.wait=new Promise(r=>release=r);const pending=c.flow.claim();await c.flow.claim();assert.equal(c.prepared,1);c.flow.dispose();release();await pending;assert.equal(c.approved,0)
const d=setup();d.result={status:'claimed_elsewhere'};await d.flow.claim();assert.equal(d.flow.state.phase,'unavailable')
const e=setup();e.result={status:'confirmed'};await e.flow.claim();assert.equal(e.flow.state.phase,'unconfirmed')
console.log('PASS gift claim UI orchestration: no hash-only success, no duplicate approval, timeout recheck, disposal and recipient-specific terminal states.')
const {readPocketGift}=await import('../src/pocket/api/pocketGiftsClient.ts')
const id='g_'+'a'.repeat(22)
const gift={id,sender:'@test',amount:'10',message:'Enjoy',network:'base',status:'available'}
let requested=''
assert.equal((await readPocketGift(id,async url=>{requested=String(url);return new Response(JSON.stringify({ok:true,gift}))})).amount,'10')
assert.equal(requested.includes('#claim'),false)
await assert.rejects(()=>readPocketGift(id,async()=>new Response('<html>offline</html>',{status:502})),/could not be loaded/)
await assert.rejects(()=>readPocketGift(id,async()=>new Response(JSON.stringify({ok:true,gift:{...gift,id:'wrong'}}))),/could not be loaded/)
console.log('PASS public gift reader: validated gift identity and clean HTML outage handling.')

const retry=setup();retry.failure=true;await retry.flow.claim();assert.equal(retry.flow.state.phase,'unconfirmed');retry.result={status:'available',retryAllowed:true};await retry.flow.recheck();assert.equal(retry.flow.state.phase,'ready');assert.equal(retry.flow.state.transactionHash,undefined);assert.equal(retry.approved,1);retry.failure=false;retry.result={status:'confirmed',transactionHash:hash};await retry.flow.claim();assert.equal(retry.approved,2);assert.equal(retry.flow.state.phase,'confirmed');
console.log('PASS explicit server-authorized retry resets cancelled claim without automatic approval.')
