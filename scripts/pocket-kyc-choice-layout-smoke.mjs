import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,readdirSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const dir=process.env.POCKET_LAYOUT_ASSETS||'.codex-temp/preparation-native/assets'
const css=readdirSync(dir).filter(x=>x.endsWith('.css')).map(x=>readFileSync(dir+'/'+x,'utf8')).join('\n')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/pocket/components/PocketKycPanel';window.fetch=async()=>new Response(JSON.stringify({ok:true,environment:'sandbox',status:'passed',verified:false,workflow:{bvnPassed:true,complete:false,needsAdditional:true,methods:['nin','government_id']},verification:{method:'bvn',product:'biometric_kyc',provider:'smile',country:'NG',idSelection:{NG:['BVN_MFA']},consentRequired:{NG:['BVN_MFA']},previewBVNMFA:true}}));createRoot(document.getElementById('root')).render(<div className="mx-auto max-w-md px-5 py-7"><h1 className="text-xl font-semibold">Identity verification</h1><Panel getAccessToken={async()=>'fixture'}/></div>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env.DEV':'false'}})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage();await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<html><meta name="viewport" content="width=device-width, initial-scale=1"><body><div id="root"></div></body></html>'}));await page.goto('https://fixture.invalid/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const width of [320,360,390,430]) {
  await page.setViewportSize({width,height:844});const button=page.getByRole('button',{name:'Verify NIN',exact:true});await button.waitFor();await button.scrollIntoViewIfNeeded();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.getByRole('radio').count(),2);assert.equal(await page.getByRole('button').count(),1);
  const b=await button.boundingBox();assert.ok(b.x>=0&&b.x+b.width<=width&&b.y+b.height<=844);
  if(width===390){await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'.codex-temp/pocket-kyc-choice.png',fullPage:true})}
 }
 console.log('PASS styled verification choice at 320/360/390/430px: no horizontal overflow, one primary CTA, reachable consent and action.')
}finally{await browser.close()}
