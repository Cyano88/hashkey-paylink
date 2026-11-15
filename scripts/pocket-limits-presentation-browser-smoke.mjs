import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 './PocketWalletPreparation':`export default ()=>null`,
 '../controllers/usePocketWalletController':`export const reconnectPocketBaseWallet=async()=>{}`,
 '../api/pocketBillsClient':`export const readPocketBillsLimitUsage=async()=>({resetAt:Date.now()+100000,airtime:{perPaymentUsd:50,dailyLimitUsd:150,usedTodayUsd:10,remainingTodayUsd:140},otherBills:{dailyLimitUsd:750,usedTodayUsd:25,remainingTodayUsd:725}})`,
 '../api/pocketSpendingLimitsClient':`export const readPocketBankPayoutLimit=async()=>({maxUsdc:6992,ngnEquivalent:9788800,asOf:Date.now()})`,
 '../hooks/usePocketDisplayCurrency':`export default ()=>window.currency`,
 './usePocketDisplayCurrency':`export default ()=>window.currency`,
 '../hooks/usePocketFxQuote':`export default ()=>({refresh:async()=>{}})`,
 './usePocketFxQuote':`export default ()=>({quote:{rate:1400},loading:false,refresh:async()=>{}})`,
}
const result=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from './src/pocket/components/PocketProfileFeaturePage';window.render=()=>createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/profile?feature=limits']}><Page feature="limits" email="fixture" getAccessToken={async()=> 'fixture'} onBack={()=>{}}/></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true});await mkdir('output/playwright',{recursive:true})
try{for(const width of [320,390])for(const currency of ['USDC','NGN','UGX'])for(const level of ['basic','advanced']){
 const p=await browser.newPage({viewport:{width,height:920}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
 await p.route('https://limits.test/**',r=>{const url=new URL(r.request().url());if(url.pathname==='/api/pocket/kyc')return r.fulfill({json:{ok:true,level,paymentLevel:level,dailyLimitUsd:level==='basic'?50:7000,remainingUsd:level==='basic'?50:7000}});if(url.searchParams.get('limits')==='true'){const country=url.searchParams.get('country'),ug=country==='UG';return r.fulfill({json:{ok:true,data:{limits:{country,currency:ug?'UGX':'NGN',category:url.searchParams.get('category'),services:[{id:'test',name:ug?'Uganda MTN':'Airtel Nigeria',minimum:50,providerMaximum:ug?519480:50000,availableMaximum:ug?181818.18:50000,available:true,planPriced:false}]}}}})}return r.fulfill({contentType:'text/html',body:'<html><body><div id="root"></div></body></html>'})})
 await p.goto('https://limits.test');await p.addStyleTag({content:css});await p.evaluate(c=>{window.currency=c},currency);await p.addScriptTag({content:result.outputFiles[0].text});await p.evaluate(()=>window.render())
 const menu=p.getByRole('region',{name:'Spending limit categories'});await menu.waitFor();assert.equal(await menu.getByRole('button').count(),7)
 await p.getByText('Basic verified',{exact:true}).first().waitFor();for(const badge of await p.getByText(/^(Basic|Advanced) verified$/).all())assert((await badge.getAttribute('class')).includes('bg-emerald-50'))
 const text=await menu.innerText();assert(text.includes('USD 150.00'));assert(!/\b(NGN|UGX|USDC)\b/.test(text));assert(!text.includes('Provider maximum'))
 for(const theme of ['light','dark']){await p.evaluate(t=>document.documentElement.classList.toggle('dark',t==='dark'),theme);await p.screenshot({path:`output/playwright/clean-limits-${currency}-${level}-${theme}-${width}.png`})}
 await menu.getByRole('button',{name:/^Airtime/}).click();await p.getByRole('heading',{name:'Airtime',exact:true}).waitFor();assert.equal(await menu.count(),0);await p.getByText('Airtel Nigeria',{exact:true}).waitFor();assert((await p.locator('body').innerText()).includes('NGN 50,000.00'))
 await p.getByRole('button',{name:'Country',exact:true}).click();assert(await p.getByRole('option',{name:'Kenya · Coming soon',exact:true}).isDisabled());await p.getByRole('option',{name:'Uganda · UGX',exact:true}).click();await p.getByText('Uganda MTN',{exact:true}).waitFor()
 assert((await p.locator('body').innerText()).includes('UGX 181,818.18'));assert((await p.locator('body').innerText()).includes('USD 150.00'))
 await p.screenshot({path:`output/playwright/clean-limit-detail-${currency}-${level}-${width}.png`})
 await p.evaluate(()=>document.dispatchEvent(new Event('pocket:native-back',{cancelable:true,bubbles:true})));await menu.waitFor()
 await menu.getByRole('button',{name:/^Online and QR purchases/}).click();await p.getByRole('heading',{name:'Online and QR purchases',exact:true}).waitFor();await p.getByText('Basic verified',{exact:true}).waitFor();await p.getByRole('button',{name:'Back',exact:true}).click();await menu.waitFor()
 await menu.getByRole('button',{name:/^Electricity/}).click();await p.getByRole('button',{name:'Country',exact:true}).click();assert(await p.getByRole('option',{name:'Uganda · Unavailable',exact:true}).isDisabled());await p.getByRole('option',{name:'Nigeria · NGN',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click();await menu.waitFor()
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);await p.close()
}console.log('PASS Bills-style menu, separate detail pages, native/header back, fixed USD despite balance preference, actual green Basic/Advanced badges, live-country fixture bounds, unavailable countries, 320/390 and light/dark.')}finally{await browser.close()}
