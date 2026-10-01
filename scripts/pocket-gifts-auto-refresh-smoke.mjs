import assert from 'node:assert/strict'
import {startGiftAutoRefresh} from '../src/pocket/features/gifts/giftAutoRefresh.ts'
const timers=new Map();let id=0,calls=0,visible=true,release
const poller=startGiftAutoRefresh(async()=>{calls++;await new Promise(r=>release=r)},{canRefresh:()=>visible,schedule:(run,delay)=>{const key=++id;timers.set(key,{run,delay});return key},cancel:key=>timers.delete(key)})
const tick=()=>{const [key,timer]=timers.entries().next().value;timers.delete(key);timer.run()}
assert.equal([...timers.values()][0].delay,2500);tick();assert.equal(calls,1)
poller.checkNow();assert.equal(calls,1,'No overlap on focus or repeated taps')
release();await new Promise(r=>setImmediate(r));assert.equal(timers.size,1)
visible=false;tick();await new Promise(r=>setImmediate(r));assert.equal(calls,1,'Hidden app does not poll')
visible=true;poller.checkNow();assert.equal(calls,2);poller.dispose();release();await new Promise(r=>setImmediate(r));assert.equal(timers.size,0,'Disposal stops polling even during in-flight response')
console.log('PASS automatic gift checks: backoff, no overlap, hidden-app pause, focus refresh and disposal.')
