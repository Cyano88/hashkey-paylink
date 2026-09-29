import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:`import {executeRecoverableCircleApproval} from './src/lib/circleRecoverableApproval';window.start=()=>{const sdk={messageHandler(event){if(event.origin==='https://pw-auth.circle.com'&&event.data?.onClose)document.getElementById('sdkIframe')?.remove()},execute(id,cb){window.callback=cb;const f=document.createElement('iframe');f.id='sdkIframe';f.src='https://pw-auth.circle.com/fixture';f.style.cssText='position:fixed;inset:0;width:100%;height:100%;border:0;z-index:2147483647';document.body.append(f);window.originalStyle=f.getAttribute('style')}};window.addEventListener('message',sdk.messageHandler);window.outcome=null;window.attempt=executeRecoverableCircleApproval(sdk,'fixture',e=>e.message).then(()=>window.outcome='success',e=>window.outcome=e.message)};`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<div data-pocket-sheet style="position:fixed;bottom:0;height:400px"><button>Underlying form</button></div>'}))
 // Provider fixture has an independently scrolling body and an anchored footer.
 // This checks host non-interference, not the real provider's private UI.
 await page.route('https://pw-auth.circle.com/fixture',r=>r.fulfill({contentType:'text/html',body:`<style>html,body{margin:0;height:100%;overflow:hidden}body{display:flex;flex-direction:column}header,footer{flex:none;padding:12px}main{flex:1;min-height:0;overflow:auto}button{height:44px}</style><header><button onclick="parent.postMessage({onClose:true},'*')">Circle close</button></header><main><div style="height:1200px">Authorization details</div><div id="last">Final authorization detail</div></main><footer><button>Confirm</button></footer>`}))
 await page.goto('https://fixture.invalid/');await page.addScriptTag({content:bundle.outputFiles[0].text})
 for(const height of [844,480]) {
  await page.setViewportSize({width:390,height});await page.evaluate(()=>window.start())
  const provider=page.frameLocator('#sdkIframe'),confirm=provider.getByRole('button',{name:'Confirm',exact:true})
  await confirm.waitFor()
  assert(await page.evaluate(()=>document.getElementById('sdkIframe').parentElement===document.body),'Frame is not reparented')
  assert.equal(await page.locator('#sdkIframe').getAttribute('style'),await page.evaluate(()=>window.originalStyle),'SDK geometry is untouched')
  const bounds=await page.locator('#sdkIframe').boundingBox();assert.equal(bounds.height,464,'Provider viewport is 64px taller than Pocket sheet');assert.equal(bounds.y+ bounds.height,height,'Sheet anchored at viewport bottom');assert.equal(await page.locator('[data-circle-approval-surface] iframe').count(),0,'No outer scrolling panel')
  const before=await confirm.boundingBox();await page.evaluate(()=>{const f=document.getElementById('sdkIframe');Object.assign(f.style,{position:'fixed',top:'50%',left:'50%',height:'100%',transform:'translate(-50%,-50%)'})});assert.deepEqual(await confirm.boundingBox(),before,'SDK showUi cannot expand or shift the sheet')
  await provider.locator('main').evaluate(e=>e.scrollTop=e.scrollHeight)
  assert.deepEqual(await confirm.boundingBox(),before,'Confirm stays anchored while authorization details scroll')
  const last=await provider.locator('#last').boundingBox();assert(last.y+last.height<=before.y,'Last detail is reachable above Confirm')
  await page.evaluate(()=>window.postMessage({onClose:true},'*'));assert.equal(await page.evaluate(()=>window.outcome),null,'Wrong-origin close ignored')
  await provider.getByRole('button',{name:'Circle close'}).click();await page.waitForFunction(()=>window.outcome!==null);assert.match(await page.evaluate(()=>window.outcome),/Approval closed/)
  await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}));assert.match(await page.evaluate(()=>window.outcome),/Approval closed/)
 }
 for(const action of ['escape','back','success']) {
  await page.evaluate(()=>window.start());await page.frameLocator('#sdkIframe').getByRole('button',{name:'Confirm',exact:true}).waitFor()
  if(action==='escape')await page.keyboard.press('Escape')
  if(action==='back')await page.evaluate(()=>window.dispatchEvent(new Event('pocket:native-back',{cancelable:true})))
  if(action==='success')await page.evaluate(()=>window.callback(null,{status:'COMPLETE'}))
  await page.waitForFunction(()=>window.outcome!==null);assert.equal(await page.locator('#sdkIframe').count(),0)
  assert.match(await page.evaluate(()=>window.outcome),action==='success'?/^success$/:/Approval closed/)
 }
 console.log('PASS: compact viewport preserved across SDK updates; internal body scroll leaves Confirm anchored at two viewport sizes; Circle close, back, Escape and late-callback safety. Mock payments only.')
} finally {await browser.close()}

