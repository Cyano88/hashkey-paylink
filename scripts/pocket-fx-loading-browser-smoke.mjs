import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import useFx from './src/pocket/hooks/usePocketFxQuote';window.currency='NGN';function App(){const fx=useFx(1,true,window.currency);window.fx=fx;window.displayFx=useFx(1,true,window.currency,true);return <output>{JSON.stringify(fx)}</output>}const root=createRoot(document.getElementById('app'));window.mount=()=>root.render(<App/>);window.mount()`,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();let mode='error',held
 await page.route('**/*',async r=>{if(r.request().resourceType()==='document')return r.fulfill({contentType:'text/html',body:'<div id="app"></div>'});if(mode==='hold')await new Promise(resolve=>held=resolve);if(mode==='error')return r.fulfill({status:503,json:{ok:false,error:'Fixture unavailable'}});const currency=new URL(r.request().url()).searchParams.get('currency');return r.fulfill({json:{ok:true,quote:{currency,symbol:currency==='NGN'?'\u20a6':'UGX',amount:'1',rate:currency==='NGN'?1400:3700,source:'paycrest',side:'sell',quotedAt:Date.now(),expiresAt:Date.now()+60000}}})})
 await page.goto('https://fixture.test');await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.waitForFunction(()=>window.fx.error&&!window.fx.busy)
 mode='hold';await page.evaluate(()=>{window.currency='UGX';window.mount()});await page.waitForFunction(()=>window.fx.loading)
 assert.equal(await page.evaluate(()=>window.fx.quote),null)
 while(!held)await page.waitForTimeout(10);mode='ok';held();await page.waitForFunction(()=>window.fx.quote?.currency==='UGX')
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket:fx:v1:UGX:1')).rate),3700,'Valid rates persist for restart')
 // Expire only the short refresh cache, not the 60s provider validity window.
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+31000});mode='error';await page.evaluate(()=>window.fx.refresh());await page.waitForFunction(()=>window.fx.error&&!window.fx.busy)
 assert.equal(await page.evaluate(()=>window.fx.quote.currency),'UGX','Failed refresh retains an unexpired quote')
 assert.equal(await page.evaluate(()=>window.fx.loading),false)
 await page.evaluate(()=>{const now=Date.now;Date.now=()=>now()+31000;window.mount()});assert.equal(await page.evaluate(()=>window.fx.quote),null,'Expired quote is never shown as live')
 assert.equal(await page.evaluate(()=>window.displayFx.quote.rate),3700,'Display estimate survives expiry and failed refresh'); assert.equal(await page.evaluate(()=>window.displayFx.loading),false,'Cached estimate does not shimmer during refresh');
 console.log('PASS FX retry shimmer, currency isolation, valid quote retention and expired quote rejection.')
}finally{await browser.close()}
