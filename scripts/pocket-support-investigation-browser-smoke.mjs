import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import crypto from 'node:crypto'
import {supportAccountAnswer} from '../api/pocket/support-account-answer.ts'
import {submitSupportConversation} from '../api/pocket/support-conversation.ts'
import {supportActions} from '../src/pocket/lib/pocketSupportActions.ts'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const pixel=process.argv.includes('--pixel')
const browser=pixel?await chromium.connectOverCDP('http://127.0.0.1:9229',{timeout:15000}):await chromium.launch({headless:true,channel:'chrome'})
const page=pixel?browser.contexts()[0].pages()[0]:await browser.newPage({viewport:{width:390,height:844}})
const original=page.url();if(pixel&&await page.locator('textarea').count()&&await page.locator('textarea').first().inputValue())throw Error('Pixel has an unsent draft; not replacing it')
let cases={},clock=Date.now(),sent=[],providerCalls=0,failNext=false
const rows=[{eventId:'ngn-fixture',txHash:'0x'+'a'.repeat(64),bankOrderId:'bank-fixture-ngn',chain:'base',payer:'fixture',memo:'',amount:'0.74',amountNgn:'1000',fiatCurrency:'NGN',ts:clock,source:'bank-withdraw',direction:'out',bankSettlementStatus:'processing'}, {eventId:'ugx-fixture',txHash:'0x'+'b'.repeat(64),bankOrderId:'bank-fixture-ugx',chain:'base',payer:'fixture',memo:'',amount:'0.27',amountNgn:'1000',fiatCurrency:'UGX',ts:clock-1000,source:'bank-withdraw',direction:'out',bankSettlementStatus:'settled'}, {eventId:'incoming-fixture',txHash:'0x'+'c'.repeat(64),chain:'base',payer:'fixture',memo:'',amount:'1',ts:clock-2000,source:'wallet-deposit',direction:'in',paycrestStatus:'confirmed'}]
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import Support from './src/pocket/components/PocketSupportView';createRoot(document.getElementById('root')).render(<Support call={body=>window.auditCall(body)} onClose={()=>window.auditClosed=true} onOpenReceipt={id=>window.auditReceipt=id}/>);`
const bundle=await build({stdin:{contents:fixture,loader:'tsx',resolveDir:process.cwd()},outdir:'.codex-temp/support-investigation-fixture',bundle:true,write:false,format:'iife',jsx:'automatic'})
const css=(await postcss([tailwind({darkMode:'class',content:['src/pocket/components/PocketSupportView.tsx','src/components/DynamicSendButton.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css
const html='<html class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text+'</style><div id="root"></div></html>'
const url=pixel?'https://app.hashpaylink.com/__support_device_audit__':'https://fixture.invalid/'
await page.exposeFunction('auditCall',async body=>{
 if(body.action==='list-mine')return{cases:Object.values(cases),team:[{displayName:'Test representative'}]}
 if(body.action==='mark-read')return{case:cases[body.caseId]}
 sent.push(body);if(failNext){failNext=false;throw Error('Synthetic network outage')}
 clock+=61000
 const message=body.optionId?supportActions[body.optionId].message:body.message
 const input={identity:{kind:'privy',subject:'fixture-owner'},profileId:'fixture-profile',question:message,selectedEventId:body.optionId==='payment_details'?body.eventId:undefined,requestId:body.requestId,caseId:body.caseId,newConversation:body.newConversation,cases}
 const accountAnswer=await supportAccountAnswer(input,{profile:async()=>({resolvedName:'Test Customer'}),payments:async()=>rows,now:()=>clock,payoutStatus:async()=>{providerCalls++;return{status:'settled',checkedAt:clock}},chainCheck:async()=>({status:'unavailable',text:'Live check temporarily unavailable. Your reference is saved.'})})
 const item=submitSupportConversation(cases,{...body,profileId:'fixture-profile',message},clock,crypto.randomUUID,{tenantId:'fixture',entries:{},accountAnswer})
 return{case:JSON.parse(JSON.stringify(item))}
})
await page.route(url,r=>r.fulfill({contentType:'text/html',body:html}))
const errors=[];page.on('pageerror',e=>errors.push(e.message))
const box=()=>page.getByRole('textbox',{name:'Message',exact:true})
async function send(text,expected){await box().fill(text);await page.getByRole('button',{name:'Send message',exact:true}).click();assert.equal(await box().inputValue(),'');await page.locator('[data-pending-message]').filter({hasText:text}).waitFor();if(expected)await page.getByText(expected,{exact:false}).last().waitFor({timeout:15000});await page.waitForFunction(()=>!document.querySelector('[data-pending-message]'),{timeout:15000})}
async function open(){cases={};await page.goto(url);await page.addStyleTag({content:css+bundle.outputFiles.find(f=>f.path.endsWith('.css')).text});await page.addScriptTag({content:bundle.outputFiles.find(f=>f.path.endsWith('.js')).text});await page.getByRole('button',{name:'Send us a message',exact:true}).click()}
try{
 await open();await send("Someone sent me USDC but haven't seen it",'Share the transaction hash');await send('0x'+'c'.repeat(64),'Which network was it sent on');await send('Base','matching record');await page.getByRole('button',{name:/Incoming · 1 USDC/}).click();await page.getByText('incoming USDC transfer was on Base',{exact:false}).waitFor();await page.getByRole('button',{name:'View receipt',exact:true}).click();assert.equal(await page.evaluate(()=>window.auditReceipt),'incoming-fixture')
 await open();await send("What's does my current balance not tally",'Stablecoins or XStocks');await page.getByRole('button',{name:'USDC',exact:true}).click();await page.getByText('Which network balance looks wrong?',{exact:false}).waitFor();await send('Base shows 1 USDC but I expected 2 USDC','cannot establish your current spendable balance');await page.getByRole('button',{name:'Talk to an agent',exact:true}).click();await page.getByText('representative has not joined yet',{exact:false}).waitFor();await page.getByText('Waiting for Pocket Support',{exact:true}).waitFor()
 await open();await send('My bank transfer of 1000 naira has not arrived','possible matches');assert.equal(await page.getByRole('button',{name:/Bank transfer · ₦1,000/}).count(),1);assert.equal(await page.getByRole('button',{name:/UGX/}).count(),0);await page.getByRole('button',{name:/Bank transfer · ₦1,000/}).click();await page.getByText('Live bank payout status reported by the provider: settled.',{exact:false}).waitFor();assert.equal(providerCalls,1)
 fs.mkdirSync('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/support-investigation-'+(pixel?'pixel':'browser')+'-ngn.png'})
 await open();await send('My UGX 1000 bank payment has not arrived','possible matches');assert.equal(await page.getByRole('button',{name:/Bank transfer · UGX 1,000/}).count(),1);assert.equal(await page.getByRole('button',{name:/₦/}).count(),0)
 await page.evaluate(()=>document.documentElement.classList.remove('dark'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'output/playwright/support-investigation-'+(pixel?'pixel':'browser')+'-ugx.png'})
 await open();failNext=true;await box().fill('My payment has not arrived');await page.getByRole('button',{name:'Send message',exact:true}).click();await page.getByRole('button',{name:'Not sent · Retry',exact:true}).waitFor();const request=sent.at(-1).requestId;await box().fill('My next draft');await page.getByRole('button',{name:'Not sent · Retry',exact:true}).click();await page.getByText('Were you expecting USDC',{exact:false}).waitFor();assert.equal(sent.at(-1).requestId,request);assert.equal(await box().inputValue(),'My next draft');await box().fill('');assert.deepEqual(errors,[])
 console.log(JSON.stringify({device:pixel?'Pixel WebView':'desktop mobile viewport',realProductionComponents:true,realConversationAndAccountLogic:true,syntheticPaymentAndProviderData:true,noProductionCasesCreated:true,checks:['missing-USDC','reference-memory','incoming-receipt','balance-discrepancy','human-handoff','NGN-only-match','UGX-only-match','live-provider-status','dark-light-layout','composer-clear','retry-idempotency','new-draft-preserved'],passed:true}))
}catch(e){console.log(JSON.stringify({url:page.url(),errors,buttons:await page.getByRole('button').allTextContents(),body:(await page.locator('body').innerText()).slice(0,500)}));throw e}finally{await page.unroute(url);if(pixel)await page.goto(original);await browser.close()}
