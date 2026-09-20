import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 '@capacitor/core': `export const CapacitorHttp={request:async options=>{window.nativeCalls.push(options);return {status:200,headers:{'content-type':'application/json'},data:{ok:true}}}}`,
 './pocketRoutes': `export const isPocketNativeRuntime=()=>true;export const POCKET_ORIGIN='https://pocket.hashpaylink.com'`,
}
const bundle=await build({stdin:{contents:`import {installPocketNativeFetch} from './src/pocket/lib/pocketNativeFetch';window.nativeCalls=[];installPocketNativeFetch()`,resolveDir:process.cwd()},bundle:true,write:false,format:'iife',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();await page.route('https://localhost/**',route=>route.fulfill({contentType:'text/html',body:'<html></html>'}));await page.goto('https://localhost/');await page.addScriptTag({content:bundle.outputFiles[0].text})
 const result=await page.evaluate(async()=>{await fetch('/api/test?one=1',{method:'POST',headers:{'content-type':'application/json',Authorization:'Bearer synthetic'},body:JSON.stringify({action:'review'})});const controller=new AbortController();controller.abort();let aborted=false;try{await fetch('/api/test',{signal:controller.signal})}catch(e){aborted=e.name==='AbortError'}return {calls:window.nativeCalls,aborted}})
 assert.equal(result.calls.length,1);assert.equal(result.calls[0].url,'https://pocket.hashpaylink.com/api/test?one=1');assert.equal(result.calls[0].method,'POST');assert.deepEqual(result.calls[0].data,{action:'review'});assert.equal(result.calls[0].headers.authorization,'Bearer synthetic');assert.equal(result.aborted,true)
 console.log('PASS: native relative API rewrite preserves POST body, authorization, query, and aborted requests.')
}finally{await browser.close()}
