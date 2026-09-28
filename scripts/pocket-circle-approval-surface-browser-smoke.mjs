import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {executeRecoverableCircleApproval} from './src/lib/circleRecoverableApproval';window.start=(delay=0,timeout=10000)=>{const sdk={messageHandler(){},execute(id,cb){window.callback=cb;setTimeout(()=>{const f=document.createElement('iframe');f.id='sdkIframe';f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh';document.body.append(f)},delay)}};window.outcome=null;window.attempt=executeRecoverableCircleApproval(sdk,'fixture',e=>e.message,undefined,timeout).then(()=>window.outcome='success',e=>window.outcome=e.message)};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<style>:root{--pocket-safe-top:32px;--pocket-safe-bottom:24px}</style><button>Underlying form</button>'}))
 await page.goto('https://fixture.invalid/');await page.addScriptTag({content:bundle.outputFiles[0].text})
 for(const height of [844,480]) {
  await page.setViewportSize({width:390,height});await page.evaluate(()=>window.start(30));const close=page.getByRole('button',{name:'Close wallet approval'});await close.waitFor()
  const f=await page.locator('#sdkIframe').boundingBox(),b=await close.boundingBox()
  assert(f.y>=84);if(height===844)assert(f.height<520,'Approval stays compact rather than filling the screen');assert(Math.abs(b.x+b.width-382)<1,'X stays anchored to the right edge');assert(f.y+f.height<=height-23);assert(f.x>=0&&f.x+f.width<=390);assert(b.y>=32&&b.y+b.height<=f.y)
  await page.mouse.click(2,2);assert.equal(await page.locator('#sdkIframe').count(),1,'Backdrop cannot dismiss approval')
  await close.click();await page.waitForFunction(()=>window.outcome!==null);assert.match(await page.evaluate(()=>window.outcome),/Approval closed/)
  assert.equal(await page.locator('#sdkIframe').count(),0);assert.equal(await page.locator('[data-circle-approval-surface]').count(),0)
  await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}));assert.match(await page.evaluate(()=>window.outcome),/Approval closed/,'Late SDK callback cannot turn dismissed approval into success')
 }
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{const s=document.createElement('div');s.setAttribute('data-pocket-sheet','');s.style.height='420px';document.body.append(s);window.start()});await page.getByRole('button',{name:'Close wallet approval'}).waitFor();assert(Math.abs((await page.locator('[data-circle-approval-surface] > div').boundingBox()).height-484)<1,'Sheet adds 64px to the existing confirmation');await page.setViewportSize({width:390,height:480});await page.waitForFunction(()=>document.getElementById('sdkIframe').getBoundingClientRect().bottom<=456);const resized=await page.getByRole('button',{name:'Close wallet approval'}).boundingBox();assert.equal(resized.x+resized.width,382,'Keyboard resize does not move X to the left');await page.keyboard.press('Escape');await page.waitForFunction(()=>window.outcome!==null);assert.equal(await page.locator('#sdkIframe').count(),0)
 await page.evaluate(()=>window.start());await page.getByRole('button',{name:'Close wallet approval'}).waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('pocket:native-back',{cancelable:true})));await page.waitForFunction(()=>window.outcome!==null);assert.equal(await page.locator('#sdkIframe').count(),0)
 await page.evaluate(()=>window.start());await page.getByRole('button',{name:'Close wallet approval'}).waitFor();await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}));await page.waitForFunction(()=>window.outcome==='success');assert.equal(await page.locator('[data-circle-approval-surface]').count(),0)
 await page.evaluate(()=>window.start(0,100));await page.waitForFunction(()=>window.outcome!==null);assert.match(await page.evaluate(()=>window.outcome),/stopped responding/);assert.equal(await page.locator('#sdkIframe').count(),0)
 console.log('PASS: delayed frame, phone/keyboard safe bounds, X/Escape/native back, backdrop protection, timeout and success cleanup, late callback protection. No real payment.')
} finally {await browser.close()}
