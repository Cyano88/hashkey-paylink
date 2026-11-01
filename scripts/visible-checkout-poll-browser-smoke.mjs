import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {startVisibleCheckoutPoll} from './src/lib/visibleCheckoutPoll';window.reads=[];window.errors=[];window.start=()=>{window.stop=startVisibleCheckoutPoll(signal=>new Promise((resolve,reject)=>{window.reads.push({signal,resolve,reject});signal.addEventListener('abort',()=>reject(Error('aborted')))}),(error,timeout)=>window.errors.push({timeout}))};window.visibility=value=>{Object.defineProperty(document,'visibilityState',{configurable:true,value});document.dispatchEvent(new Event('visibilitychange'))};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const p=await browser.newPage();await p.clock.install();await p.goto('about:blank');await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.evaluate(()=>{window.visibility('hidden');window.start()});await p.clock.runFor(60000);assert.equal(await p.evaluate(()=>window.reads.length),0)
 await p.evaluate(()=>window.visibility('visible'));await p.clock.runFor(1);assert.equal(await p.evaluate(()=>window.reads.length),1)
 await p.evaluate(()=>window.reads[0].resolve(true));await p.clock.runFor(10001);assert.equal(await p.evaluate(()=>window.reads.length),2)
 assert.equal(await p.evaluate(()=>window.reads[1].signal===window.reads[0].signal),false)
 await p.evaluate(()=>window.visibility('hidden'));await p.clock.runFor(60000);assert.equal(await p.evaluate(()=>window.reads.length),2);assert.deepEqual(await p.evaluate(()=>window.errors),[])
 await p.evaluate(()=>{window.visibility('visible');window.visibility('visible')});await p.clock.runFor(1);assert.equal(await p.evaluate(()=>window.reads.length),3)
 await p.evaluate(()=>window.reads[2].resolve(false));await p.clock.runFor(60000);await p.evaluate(()=>{window.visibility('hidden');window.visibility('visible')});await p.clock.runFor(1);assert.equal(await p.evaluate(()=>window.reads.length),3)
 await p.evaluate(()=>{window.stop();window.start()});await p.clock.runFor(15001);assert.deepEqual(await p.evaluate(()=>window.errors),[{timeout:true}])
 await p.evaluate(()=>{window.stop();window.start();window.stop()});await p.clock.runFor(60000);assert.deepEqual(await p.evaluate(()=>window.errors),[{timeout:true}])
 console.log('PASS real Chrome: hidden idle makes zero reads, resume is single-flight, controllers are request-scoped, terminal stops, timeout and cleanup do not poison future reads')
}finally{await browser.close()}
