import assert from 'node:assert/strict'
import {readPocketBillsAvailability,cachedPocketBillsAvailability} from '../src/pocket/api/pocketBillsClient.ts'
let calls=0, fail=false, clock=100000,enabled=true,release
const now=Date.now;Date.now=()=>clock
globalThis.fetch=async()=>{calls++;if(fail)throw new Error('temporary outage');if(release===null)await new Promise(done=>release=done);return new Response(JSON.stringify({bills:{enabled,environment:'sandbox',categories:['airtime','data','tv','electricity']}}))}
try{
 fail=true;await assert.rejects(readPocketBillsAvailability());assert.equal(cachedPocketBillsAvailability(),undefined,'failure is unknown, not disabled')
 fail=false;release=null;const first=readPocketBillsAvailability(),second=readPocketBillsAvailability();assert.equal(calls,2,'simultaneous screens share one request');release();await Promise.all([first,second]);assert.equal(cachedPocketBillsAvailability().enabled,true)
 clock+=31000;fail=true;await assert.rejects(readPocketBillsAvailability());assert.equal(cachedPocketBillsAvailability().enabled,true,'outage retains verified config')
 fail=false;enabled=false;await readPocketBillsAvailability();assert.equal(cachedPocketBillsAvailability().enabled,false,'explicit disabled state is honored')
 console.log('PASS Bills availability outage recovery, deduplication, cached configuration and confirmed disablement.')
}finally{Date.now=now}
