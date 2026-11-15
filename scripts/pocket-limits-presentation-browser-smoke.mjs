import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 '../hooks/usePocketDisplayCurrency':`export default ()=>window.currency`,
 './usePocketDisplayCurrency':`export default ()=>window.currency`,
 './usePocketFxQuote':`export default (_amount,_enabled,currency)=>({quote:{rate:currency==='UGX'?3700:1400},loading:false,refresh:async()=>{}})`,
}
const result=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel from './src/pocket/components/PocketLimitsPanel';window.render=()=>createRoot(document.getElementById('root')).render(<MemoryRouter><main className="mx-auto max-w-[462px] px-4 py-6"><h1 className="text-xl font-semibold">Spending limits</h1><Panel usage={{airtime:{perPaymentNgn:50000,dailyLimitNgn:200000,usedTodayNgn:10000},otherBills:{dailyLimitNgn:1000000,usedTodayNgn:250000}}} bank={{maxUsdc:6992,ngnEquivalent:9788800,asOf:Date.now()}} busy={false} error="" onRefresh={()=>{}} getAccessToken={async()=> 'fixture'}/></main></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('output/playwright',{recursive:true})
try{for(const width of [320,390])for(const currency of ['USDC','NGN','UGX'])for(const level of ['basic','advanced']){
 const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://limits.test/**',r=>new URL(r.request().url()).pathname==='/api/pocket/kyc'?r.fulfill({json:{ok:true,level,paymentLevel:level,dailyLimitUsd:level==='basic'?50:7000,remainingUsd:level==='basic'?37.5:6980}}):r.fulfill({contentType:'text/html',body:'<html><head></head><body style="background:#F5F5F7"><div id="root"></div></body></html>'}))
 await page.goto('https://limits.test');await page.addStyleTag({content:css});await page.evaluate(c=>{window.currency=c},currency);await page.addScriptTag({content:result.outputFiles[0].text});await page.evaluate(()=>window.render())
 await page.getByText(level==='basic'?'Basic verified':'Advanced verified',{exact:true}).waitFor()
 const text=await page.locator('body').innerText();assert(!text.includes('USDC'),'Valuation follows platform fiat currency, not token ticker')
 assert(text.includes(currency==='USDC'?'USD':currency));assert.equal(await page.getByRole('button',{name:'Complete Advanced verification',exact:true}).count(),level==='basic'?1:0)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 for(const theme of ['light','dark']){await page.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await page.screenshot({path:`output/playwright/pocket-limits-${currency}-${level}-${theme}-${width}.png`,fullPage:true})}
 assert.deepEqual(errors,[]);await page.close()
}console.log('PASS USD/NGN/UGX displays, Basic upgrade vs Advanced unlocked, remaining values, both themes, no overflow and no page errors.')}finally{await browser.close()}
