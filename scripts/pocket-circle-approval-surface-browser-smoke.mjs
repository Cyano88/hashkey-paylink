import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {executeRecoverableCircleApproval} from './src/lib/circleRecoverableApproval';window.start=(delay=0,timeout=10000)=>{const sdk={messageHandler(){},execute(id,cb){window.callback=cb;setTimeout(()=>{const f=document.createElement('iframe');f.id='sdkIframe';f.src='https://pw-auth.circle.com/fixture';f.style.cssText='position:fixed;inset:0;width:100vw;height:100vh';document.body.append(f)},delay)}};window.outcome=null;window.attempt=executeRecoverableCircleApproval(sdk,'fixture',e=>e.message,undefined,timeout).then(()=>window.outcome='success',e=>window.outcome=e.message)};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<style>:root{--pocket-safe-top:32px;--pocket-safe-bottom:24px}</style><button>Underlying form</button>'}))
 await page.route('https://pw-auth.circle.com/fixture',r=>r.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;height:640px;overflow:hidden}button{height:44px}</style><button onclick="parent.postMessage({onClose:true},'*')">Circle close</button><div style="height:540px">Authorization details</div><button id="last">Authorize</button>`}))
 await page.goto('https://fixture.invalid/');await page.addScriptTag({content:bundle.outputFiles[0].text})
 for(const height of [844,480]) {
  await page.setViewportSize({width:390,height});await page.evaluate(h=>{if(h===480)Element.prototype.moveBefore=undefined;window.start(30)},height);const panel=page.locator('[data-circle-approval-surface] > div');await panel.waitFor()
  const bounds=await panel.boundingBox();assert(bounds.y>=32);assert(bounds.y+bounds.height<=height+1);if(height===844)assert(bounds.height<=600)
  assert.equal(await page.getByRole('button',{name:'Close wallet approval'}).count(),0,'Only Circle owns a close button')
  await page.frameLocator('#sdkIframe').getByRole('button',{name:'Authorize',exact:true}).waitFor()
  await page.mouse.move(190,bounds.y+100);await page.mouse.wheel(0,700);await page.waitForFunction(()=>document.querySelector('[data-circle-approval-surface] > div').scrollTop>0)
  const f=await page.locator('#sdkIframe').boundingBox(),last=await page.frameLocator('#sdkIframe').getByRole('button',{name:'Authorize',exact:true}).boundingBox();assert(last.y>=bounds.y&&last.y+last.height<=bounds.y+bounds.height,'Last authorization control is reachable by scrolling inside the iframe')
  await page.evaluate(()=>{const f=document.getElementById('sdkIframe');Object.assign(f.style,{position:'fixed',zIndex:'2147483647',top:'50%',left:'50%',transform:'translate(-50%, -50%)'});f.width='100%';f.height='100%'})
  await page.waitForFunction(()=>document.getElementById('sdkIframe').style.position==='relative');assert.deepEqual(await page.locator('#sdkIframe').boundingBox(),f,'SDK update preserves scroll position and geometry')
  await page.mouse.click(2,2);assert.equal(await page.locator('#sdkIframe').count(),1)
  await panel.evaluate(e=>e.scrollTop=0);await page.frameLocator('#sdkIframe').getByRole('button',{name:'Circle close'}).click();await page.waitForFunction(()=>window.outcome!==null);assert.match(await page.evaluate(()=>window.outcome),/Approval closed/);assert.equal(await page.locator('#sdkIframe').count(),0)
  await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}));assert.match(await page.evaluate(()=>window.outcome),/Approval closed/)
 }
 await page.evaluate(()=>window.start());await page.locator('#sdkIframe').waitFor();await page.keyboard.press('Escape');await page.waitForFunction(()=>window.outcome!==null);assert.equal(await page.locator('#sdkIframe').count(),0)
 await page.evaluate(()=>window.start());await page.locator('[data-circle-approval-surface]').waitFor();await page.evaluate(()=>window.dispatchEvent(new Event('pocket:native-back',{cancelable:true})));await page.waitForFunction(()=>window.outcome!==null);assert.equal(await page.locator('#sdkIframe').count(),0)
 await page.evaluate(()=>window.start());await page.locator('[data-circle-approval-surface]').waitFor();await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}));await page.waitForFunction(()=>window.outcome==='success');assert.equal(await page.locator('[data-circle-approval-surface]').count(),0)
 console.log('PASS: one Circle close control, cross-origin scroll to last authorization control, compact safe bounds, SDK showUi stability, cancellation and late callback safety. Mock payments only.')
} finally {await browser.close()}
