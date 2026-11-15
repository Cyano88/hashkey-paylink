import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/pocket/components/PocketKycPanel';window.calls=[];window.fetch=async(_,init)=>{const body=JSON.parse(init.body);window.calls.push(body);return Response.json({...window.result,token:'fixture',partnerId:'fixture'})};window.SmileIdentity=()=>{};createRoot(document.getElementById('root')).render(<Panel initialLevel={window.advanced?'advanced':'basic'} getAccessToken={async()=>'fixture'}/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env.DEV':'false'}})
const browser=await chromium.launch({headless:true,channel:'chrome'}),css=await checkoutTestCss()
try{for(const advanced of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid');await page.addStyleTag({content:css})
 await page.evaluate(advanced=>{window.advanced=advanced;window.result={ok:true,environment:'production',status:advanced?'passed':'not_started',verified:false,workflow:{basicMethod:'nin',basicPassed:advanced,bvnPassed:false,complete:false,needsAdditional:advanced,methods:['bvn']},verification:{method:'nin',country:'NG',countryName:'Nigeria',provider:'smile',product:'biometric_kyc',idSelection:{NG:['NIN_V2']},consentRequired:{NG:[]},previewBVNMFA:false}}},advanced)
 await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByText('NIN + selfie',{exact:false}).waitFor()
 const action=page.getByRole('button',{name:advanced?'Verify BVN':'Verify Basic',exact:true});await action.waitFor();assert.equal(await page.getByRole('radio').count(),0)
 await page.getByRole('checkbox').check();await action.click();await page.waitForFunction(()=>window.calls.some(c=>c.action==='start'))
 assert.equal(await page.evaluate(()=>window.calls.find(c=>c.action==='start').method),advanced?'bvn':'nin')
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.close()
}console.log('PASS NIN Basic and BVN Advanced labels, consent and correct API method dispatch.')}finally{await browser.close()}
