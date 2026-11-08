import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutHandoff} from '../src/lib/checkoutHandoff.ts'
import {parsePocketScanCode} from '../src/pocket/lib/pocketScanCode.ts'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const id='chks_'+'a'.repeat(24),store='https://play.google.com/apps/internaltest/4701069716962238662';
const cash=checkoutHandoff(id,'attempt123',true);assert.equal(new URL(cash.url).searchParams.get('method'),'cash_balance');assert.equal(new URL(parsePocketScanCode(cash.url).url).searchParams.get('method'),'cash_balance');assert(cash.android.includes(encodeURIComponent('method=cash_balance')));
const bundle=await build({stdin:{contents:`import React from'react';import{MemoryRouter}from'react-router-dom';import{createRoot}from'react-dom/client';import Choice from'./src/components/CheckoutChoice';createRoot(document.getElementById('root')).render(<MemoryRouter><Choice initialCash={location.search.includes('method=cash_balance')} id='${id}' merchant='Lunchroom' amount='NGN 2053.13' expiresAt={new Date(Date.now()+600000).toISOString()} onCash={()=>document.body.dataset.web='cash'} onBrowser={()=>document.body.dataset.web='stablecoins'}/></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const variant of ['desktop','android','fallback']){
 const page=await browser.newPage({viewport:{width:variant==='desktop'?1280:390,height:850},...(variant!=='desktop'?{userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140.0 Mobile Safari/537.36'}:{})});const writes=[];page.on('pageerror',e=>console.error('PAGE',e.message));
 await page.route('https://checkout.test/**',async r=>{if(r.request().method()!=='GET')writes.push(r.request().url());if(r.request().url().includes('/api/'))return r.fulfill({json:{playStoreUrl:store}});if(r.request().resourceType()==='image')return r.fulfill({status:404,body:''});return r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})});
 await page.goto('https://checkout.test/pay/c/'+id+(variant==='fallback'?'?pocketFallback=1&method=cash_balance':''));
 if(variant!=='fallback'){await page.getByRole('button',{name:/Cash balance/}).click();}
 await page.getByRole('heading',{name:'Pay with cash balance'}).waitFor();assert.equal(await page.getByLabel('Payment network').count(),0);assert.equal(await page.locator('body').getAttribute('data-web'),null);
 const app=page.getByRole('link',{name:variant==='fallback'?'Get Pocket':'Pay with Pocket',exact:true});await app.waitFor();const href=await app.getAttribute('href');
 if(variant==='android'){assert(href.startsWith('intent://'));assert(href.includes('method=cash_balance'))}
 else if(variant==='fallback')assert.equal(href,store);
 else{assert(href.includes('/open/checkout/'));await app.click();assert.equal(await page.getByRole('link',{name:'Get Pocket',exact:true}).getAttribute('href'),store)}
 assert.equal(await page.locator('body').getAttribute('data-web'),null);assert.equal(writes.length,0,'App/download choice cannot prepare or pay');
 await page.getByRole('button',{name:'Pay on web',exact:true}).click();assert.equal(await page.locator('body').getAttribute('data-web'),'cash');await page.close();
}console.log('PASS Cash app-only handoff, Android intent, method preservation, desktop QR/download, exact testing fallback, no network selector, explicit web continuation and no payment writes.')}finally{await browser.close()}
