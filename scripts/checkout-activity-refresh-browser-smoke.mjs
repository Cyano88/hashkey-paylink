import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import useRefresh from './src/pocket/hooks/useCheckoutActivityRefresh';const root=createRoot(document.getElementById('root'));window.calls=[];window.failure=false;function App(props){useRefresh({...props,getAccessToken:async()=>'fixture-token'});return <div>Checkout</div>}window.show=props=>root.render(<App {...props}/>);window.close=()=>root.unmount();`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^\.\/usePocketActivity$/},()=>({path:'activity',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export async function prefetchPocketActivity(args){window.calls.push(args);if(window.failure)throw Error('offline')}`,loader:'js'}))}}]});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});
const base={verified:false,paymentId:'chk_testpayment',authenticated:true,userId:'payer',email:'payer@test.example'};
const show=async p=>{await page.evaluate(p=>window.show(p),p);await page.waitForTimeout(40)};
await show(base);assert.equal(await page.evaluate(()=>window.calls.length),0);
await show({...base,verified:true});assert.equal(await page.evaluate(()=>window.calls.length),1);assert.equal(await page.evaluate(()=>window.calls[0].fresh&&window.calls[0].isCurrent()),true);
await show({...base,verified:true});assert.equal(await page.evaluate(()=>window.calls.length),1);
await show({...base,verified:true,userId:'other',email:'other@test.example'});assert.equal(await page.evaluate(()=>window.calls[0].isCurrent()),false);
await show({...base,verified:true,authenticated:false});assert.equal(await page.evaluate(()=>window.calls.length),2);assert.equal(await page.evaluate(()=>window.calls[1].isCurrent()),false);
await page.evaluate(()=>window.failure=true);await show({...base,verified:true,paymentId:'chk_nextpayment'});assert.equal(await page.evaluate(()=>window.calls.length),3);
await page.evaluate(()=>window.close());assert.equal(await page.evaluate(()=>window.calls[2].isCurrent()),true);assert.deepEqual(errors,[]);
console.log('PASS verified-only refresh, rerender deduplication, account isolation, logout, new payment, failure handling and navigation continuation. Browser fixture; no payment submitted.');
}finally{await browser.close()}
