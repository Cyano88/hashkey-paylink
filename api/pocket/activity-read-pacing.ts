import {setTimeout as delay} from 'node:timers/promises'

/** Activity-only public RPC pacing. No retries, new endpoints or extra reads.
 * A cancelled queued scan cannot dispatch a request after its deadline. */
export function createActivityReadPacer(intervalMs=350,capacity=32,now=Date.now){
 let tail:Promise<unknown>=Promise.resolve(),queued=0,nextAt=0
 return async<T>(signal:AbortSignal,read:()=>Promise<T>):Promise<T>=>{
  signal.throwIfAborted()
  if(queued>=capacity)throw Object.assign(Error('Activity read capacity reached.'),{code:-32005,reason:'capacity'})
  queued++
  const work=tail.then(async()=>{
   signal.throwIfAborted()
   const wait=Math.max(0,nextAt-now())
   if(wait)await delay(wait,undefined,{signal})
   signal.throwIfAborted()
   nextAt=now()+intervalMs
   return read()
  }).finally(()=>{queued--})
  // Errors must not poison the queue, nor let later calls bypass an active read.
  tail=work.catch(()=>{})
  return work
 }
}
