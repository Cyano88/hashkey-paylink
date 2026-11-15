import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel from './src/pocket/components/PocketLimitsPanel';window.pending=[];window.fetch=async(url)=>new Promise(resolve=>window.pending.push({url,resolve}));const root=createRoot(document.getElementById('root'));window.show=(owner,profile,view=null)=>root.render(<MemoryRouter><Panel key={owner} verifiedProfile={profile} view={view} onSelect={()=>{}} usage={null} bank={null} busy={true} error="" onRefresh={()=>{}} getAccessToken={async()=>owner}/></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const b=await chromium.launch({channel:'chrome',headless:true}),css=await checkoutTestCss()
try{const p=await b.newPage({viewport:{width:390,height:844}});await p.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid');await p.addStyleTag({content:css});await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.evaluate(()=>window.show('account-a',{kycLevel:'advanced',kycCountry:'NG'}));await p.getByText('Advanced verified',{exact:true}).waitFor();assert.equal(await p.getByText('Basic verified',{exact:true}).count(),1)
 // No endpoint has returned: badges come only from this account's confirmed profile.
 await p.evaluate(()=>{for(const r of window.pending)r.resolve(Response.json({ok:true,level:'none',dailyLimitUsd:0}));window.pending=[]});await p.getByText('Advanced verified',{exact:true}).waitFor({state:'detached'});assert.equal(await p.getByText('Basic verified',{exact:true}).count(),0)
 await p.evaluate(()=>window.show('account-b',undefined));await p.getByRole('region',{name:'Spending limit categories'}).waitFor();assert.equal(await p.getByText(/verified$/).count(),0)
 await p.evaluate(()=>window.show('account-b',undefined,'airtime'));await p.getByRole('status',{name:'Loading country limits',exact:true}).waitFor();assert.equal(await p.getByRole('status',{name:"Loading today's usage",exact:true}).innerText(),'');assert(!/Loading/i.test(await p.locator('body').innerText()));assert.equal(await p.locator('[aria-label="Loading country limits"] .animate-pulse').count(),4)
 console.log('PASS immediate confirmed badges before response, server revocation, account remount isolation and shimmer-only usage/provider loading.')
}finally{await b.close()}
