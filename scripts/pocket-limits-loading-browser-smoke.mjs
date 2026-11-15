import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel,{pocketLimitPage} from './src/pocket/components/PocketLimitsPanel';window.parseLimit=pocketLimitPage;window.selected=null;window.pending=[];window.fetch=async(url)=>new Promise(resolve=>window.pending.push({url,resolve}));const root=createRoot(document.getElementById('root'));window.show=(owner,profile,view=null)=>root.render(<MemoryRouter><Panel key={owner} verifiedProfile={profile} view={view} onSelect={value=>window.selected=value} usage={null} bank={null} busy={true} error="" onRefresh={()=>{}} getAccessToken={async()=>owner}/></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const b=await chromium.launch({channel:'chrome',headless:true}),css=await checkoutTestCss()
try{const p=await b.newPage({viewport:{width:390,height:844}});await p.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid');await p.addStyleTag({content:css});await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.evaluate(()=>window.show('account-a',{kycLevel:'advanced',kycCountry:'NG'}));await p.getByText('Advanced verified',{exact:true}).waitFor();assert.equal(await p.getByText('Basic verified',{exact:true}).count(),1)
 // No endpoint has returned: badges come only from this account's confirmed profile.
 await p.evaluate(()=>{for(const r of window.pending)r.resolve(Response.json({ok:true,level:'none',dailyLimitUsd:0,remainingUsd:0}));window.pending=[]});await p.getByText('Advanced verified',{exact:true}).waitFor({state:'detached'});assert.equal(await p.getByText('Basic verified',{exact:true}).count(),0)
 await p.evaluate(()=>window.show('account-b',undefined));await p.getByRole('region',{name:'Spending limit categories'}).waitFor();assert.equal(await p.getByText(/verified$/).count(),0)
 await p.evaluate(()=>window.show('account-b',undefined,'airtime'));await p.getByRole('status',{name:'Loading country limits',exact:true}).waitFor();assert.equal(await p.getByRole('status',{name:"Loading today's usage",exact:true}).innerText(),'');assert(!/Loading/i.test(await p.locator('body').innerText()));assert.equal(await p.locator('[aria-label="Loading country limits"] .animate-pulse').count(),4)
 for(const [view,label] of [['purchases','Loading purchase allowance'],['transfers','Loading transfer allowance']]){
  await p.evaluate(view=>{window.pending=[];window.show('account-'+view,{kycLevel:'advanced',kycCountry:'NG'},view)},view)
  await p.getByRole('status',{name:label,exact:true}).waitFor();await p.getByRole('status',{name:'Loading country availability',exact:true}).waitFor();assert(!/Loading|Bank route capacity/.test(await p.locator('body').innerText()))
  await p.evaluate(()=>{for(const r of window.pending)r.resolve(Response.json(r.url.includes('country=')?{ok:true,countryLimits:{country:'NG',currency:'NGN',availableMaximum:5000000,network:'base',asset:'USDC',asOf:Date.now()}}:{ok:true,level:'advanced',dailyLimitUsd:7000,usedUsd:123,remainingUsd:6877}));window.pending=[]})
  await p.getByText('USD 123.00 used',{exact:true}).waitFor();await p.getByText('USD 6,877.00 left',{exact:true}).waitFor();await p.getByText('5,000,000.00',{exact:false}).waitFor();assert.equal(await p.evaluate(view=>window.parseLimit(view),view),view)
  await p.getByRole('button',{name:'Country',exact:true}).click();await p.getByRole('option',{name:'Uganda',exact:true}).click();await p.getByRole('status',{name:'Loading country availability',exact:true}).waitFor();assert.equal(await p.getByText('5,000,000.00',{exact:false}).count(),0)
  await p.evaluate(()=>{for(const r of window.pending)r.resolve(Response.json({ok:true,countryLimits:{country:'UG',currency:'UGX',availableMaximum:4000000,network:'base',asset:'USDC',asOf:Date.now()}}));window.pending=[]})
  await p.getByText('4,000,000.00',{exact:false}).waitFor();assert.equal(await p.getByText('Online UGX checkout is not available yet.',{exact:true}).count(),view==='purchases'?1:0)
  for(const width of [320,390]){await p.setViewportSize({width,height:844});assert(await p.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth))}
  await p.screenshot({path:'.codex-temp/country-'+view+'-browser.png',fullPage:true})
 }
 await p.evaluate(()=>window.show('main',{kycLevel:'advanced',kycCountry:'NG'}));const menu=p.getByRole('region',{name:'Spending limit categories'});await menu.waitFor();assert.equal(await menu.getByRole('button').count(),7)
 for(const [title,id] of [['Online and QR purchases','purchases'],['Personal transfers','transfers'],['Airtime','airtime']]){await menu.getByRole('button',{name:new RegExp('^'+title)}).click();assert.equal(await p.evaluate(()=>window.selected),id)}
 console.log('PASS country details, NGN/UGX response scoping, clean switch shimmers, narrow layouts, chevron navigation, immediate badges and account isolation.')
}finally{await b.close()}
