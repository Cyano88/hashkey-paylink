import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation}from'react-router-dom';import Payment from './src/pocket/components/PocketXPayHostedPayment';function App(){const l=useLocation();return l.pathname==='/home/scan'?<output>{l.search}</output>:<Payment terminalId="xp_fixture" destination={{id:'xpd_fixture',revision:'r1',adapter:'bsc',kind:'stablecoins',assets:['USDT'],networks:['bsc']}} asset="USDT" attemptKey="fixture-attempt-123456" onClose={()=>{}}/>}createRoot(document.getElementById('root')).render(<React.StrictMode><MemoryRouter><App/></MemoryRouter></React.StrictMode>)`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'identity',setup(b){b.onLoad({filter:/[\\/]usePocketIdentity\.tsx?$/},()=>({contents:"export default()=>({user:{id:'fixture'},getAccessToken:async()=>'fixture'})"}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
for(const child of ['/pay/c/chkb_'+'a'.repeat(24),'/pay/c/chk_'+'b'.repeat(20)+'?attempt=attempt_fixture']){
const page=await browser.newPage(),calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));let fail=true
await page.route('https://pocket.hashpaylink.com/**',async route=>{
if(new URL(route.request().url()).pathname==='/api/pocket/xpay'){calls.push(route.request().postDataJSON());await new Promise(r=>setTimeout(r,150));return route.fulfill(fail?{status:503,json:{ok:false,error:'Please try again.'}}:{json:{ok:true,checkoutUrl:child}})}
return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})})
await page.goto('https://pocket.hashpaylink.com');await page.addScriptTag({content:bundle.outputFiles[0].text})
const cta=page.getByRole('button',{name:'Continue',exact:true});assert(await cta.isDisabled());await page.getByRole('textbox',{name:'Payment amount',exact:true}).fill('2.50');await cta.evaluate(el=>{el.click();el.click()});await page.getByRole('alert').waitFor();assert.equal(calls.length,1);assert.deepEqual(calls[0],{action:'prepare-hosted',id:'xp_fixture',destinationId:'xpd_fixture',revision:'r1',asset:'USDT',amount:'2.50',key:'fixture-attempt-123456'});assert(await cta.isEnabled());fail=false;await cta.click();await page.locator('output').waitFor();assert.equal(calls.length,2);assert.deepEqual(calls[1],calls[0]);assert.equal(await page.locator('output').textContent(),'?code='+encodeURIComponent('https://app.hashpaylink.com'+child));assert.deepEqual(errors,[])
await page.close()}
console.log('PASS payer preparation: StrictMode, double-click protection, immutable retry, exact coin/destination and signed Pocket scanner handoff.')
}finally{await browser.close()}
