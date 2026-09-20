import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const bundle=await build({entryPoints:['src/lib/circleRecoverableApproval.ts'],bundle:true,write:false,format:'iife',globalName:'Recovery'});
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844}});
try {
 await page.setContent('<main>Pocket migration</main>');await page.addScriptTag({content:bundle.outputFiles[0].text});
 const results=await page.evaluate(async()=>{
  const results=[];const make=()=>{let cb;const sdk={messageHandler:()=>{},execute(id,callback){cb=callback;window.addEventListener('message',sdk.messageHandler);const f=document.createElement('iframe');f.id='sdkIframe';f.srcdoc='<h2>Application error</h2>';f.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483647';document.body.appendChild(f)}};return {sdk,finish:(err,result)=>cb(err,result)}};
  const check=(name,value)=>{if(!value)throw Error(name);results.push(name)};
  let m=make();let pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message,undefined,2000).catch(e=>e.message);
  const button=document.querySelector('button');check('exit visible above iframe',document.elementFromPoint(300,25)===button);button.click();check('cancel recovers',/saved transfer/.test(await pending));check('cancel removes crashed frame',!document.getElementById('sdkIframe'));
  m.finish(null,{status:'COMPLETE'});check('late callback stays cleaned',!document.querySelector('button'));
  m=make();pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message,undefined,15).catch(e=>e.message);check('timeout recovers',/stopped responding/.test(await pending));check('timeout removes iframe',!document.getElementById('sdkIframe'));
  m=make();pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message).catch(e=>e.message);m.finish({message:'Network error'});check('SDK failure propagated',await pending==='Network error');check('SDK failure cleans up',!document.getElementById('sdkIframe'));
  m=make();const abort=new AbortController();pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message,abort.signal).catch(e=>e.message);abort.abort();check('unmount abort recovers',/saved transfer/.test(await pending));
  m=make();pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message).catch(e=>e.message);window.dispatchEvent(new Event('offline'));check('offline recovers',/Connection lost/.test(await pending));
  m=make();pending=Recovery.executeRecoverableCircleApproval(m.sdk,'same-challenge',e=>e.message);m.finish(null,{status:'COMPLETE'});check('successful approval returned',(await pending).status==='COMPLETE');check('success cleans frame',!document.getElementById('sdkIframe'));
  return results;
 });assert.equal(results.length,12);console.log('PASS: real-browser approval crash exit, timeout, SDK error, abort, offline, success and late callbacks. No wallet requests.');
}finally{await browser.close()}
