import assert from 'node:assert/strict'
import {readFileSync,mkdirSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']})
mkdirSync('output/playwright',{recursive:true})
try {
 for (const method of ['biometric-kyc','doc-verification']) {
  const page=await browser.newPage({viewport:{width:390,height:792}})
  let submissions=0;page.on('pageerror',e=>console.log('Page error',e.message));
  await page.route('**/*',r=>{if(r.request().method()!=='GET'){if(/\/upload|\/biometric_kyc|\/doc_verification/.test(r.request().url()))submissions++;return r.abort()}return r.continue()})
  const server=readFileSync('server.ts','utf8'),csp=server.slice(server.indexOf("app.get('/pocket/identity-frame'"));
  const policy=[...csp.slice(0,csp.indexOf("].join('; ')" )).matchAll(/"([^"\n]+)"/g)].map(m=>m[1]).filter(x=>/^(default|script|style|font|img|connect|worker|media|base|form)-src |^base-uri |^form-action /.test(x)).join('; ')
  await page.route('https://fixture.invalid/frame',r=>r.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':policy},body:readFileSync('vendor/smile-id/'+method+'.html','utf8')}))
  await page.addInitScript(()=>{
   window.__smile=false;window.__face=true;window.__captures=0;window.__published=0
   const original=HTMLCanvasElement.prototype.toDataURL;HTMLCanvasElement.prototype.toDataURL=function(...args){if(args[0]==='image/jpeg')window.__captures++;return original.apply(this,args)}
   window.__smileIdentityMediapipe={loaded:true,instance:{detectForVideo:()=>{if(!window.__face)return{faceLandmarks:[],faceBlendshapes:[]};const face=Array.from({length:478},()=>({x:.5,y:.6,z:0}));face[0]={x:.32,y:.4,z:0};face[1]={x:.68,y:.8,z:0};face[13]={x:.48,y:.58,z:0};face[14]={x:.48,y:window.__smile?.64:.581,z:0};return{faceLandmarks:[face],faceBlendshapes:[{categories:[{categoryName:'mouthSmileLeft',score:window.__smile?.8:0},{categoryName:'mouthSmileRight',score:window.__smile?.8:0}]}]}}}};
   window.addEventListener('selfie-capture.publish',e=>{window.__published++;window.__imageCount=e.detail.images.length})
  })
  await page.goto('https://fixture.invalid/frame');await page.evaluate(()=>customElements.whenDefined('selfie-capture-wrapper'))
  await page.evaluate(()=>{const main=document.querySelector('main');main.hidden=false;for(const child of main.children)child.hidden=true;const wrapper=document.createElement('selfie-capture-screens');wrapper.id='capture-test';wrapper.setAttribute('initial-screen','selfie-capture');wrapper.setAttribute('theme-color','#171717');wrapper.setAttribute('show-navigation','true');main.append(wrapper)})
  const button=page.locator('#capture-test button.btn-primary');await button.waitFor({timeout:12000});await page.waitForFunction(()=>{const r=document.querySelector('#capture-test selfie-capture-wrapper')?.shadowRoot;return r&&[...r.querySelectorAll('button')].some(b=>b.classList.contains('btn-primary')&&!b.disabled)})
  await button.click();await page.waitForFunction(()=>window.__captures>=3);await page.waitForTimeout(1000)
  const paused=await page.evaluate(()=>window.__captures);await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>window.__captures),paused,'Neutral face must pause at smile stage');assert.equal(await page.evaluate(()=>window.__published),0)
  await page.evaluate(()=>window.__smile=true);await page.waitForFunction(n=>window.__captures>n,paused);await page.evaluate(()=>window.__smile=false);await page.waitForTimeout(700)
  const stopped=await page.evaluate(()=>window.__captures);assert.ok(stopped<8,'Must pause before completion');await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.__captures),stopped,'Stopping the smile pauses capture')
  await page.evaluate(()=>{window.__face=false;window.__smile=true});await page.waitForTimeout(650);assert.equal(await page.evaluate(()=>window.__captures),stopped,'No face cannot progress');await page.evaluate(()=>window.__face=true);await page.waitForFunction(()=>window.__published===1)
  assert.equal(await page.evaluate(()=>window.__imageCount),8);assert.equal(submissions,0)
  await page.locator('#capture-test selfie-capture-review:not([hidden])').waitFor();
  const preview=page.locator('#capture-test selfie-capture-review img');
  await preview.evaluate(i=>i.decode());
  assert.equal(await preview.getAttribute('alt'),'Your selfie');
  await page.locator('#capture-test #re-capture-image').click();
  await page.locator('#capture-test selfie-capture-wrapper #start-image-capture').click();
  await page.locator('#capture-test selfie-capture-review:not([hidden])').waitFor();
  await preview.evaluate(i=>i.decode());
  await page.evaluate(()=>document.getElementById('capture-test').addEventListener('selfie-capture-screens.publish',e=>{window.__accepted=(window.__accepted||0)+1;window.__acceptedCount=e.detail.images.length}));
  await page.locator('#capture-test #select-id-image').evaluate(b=>{b.click();b.click()});
  assert.equal(await page.evaluate(()=>window.__accepted),1);assert.equal(await page.evaluate(()=>window.__acceptedCount),8);
  await page.evaluate(()=>{const e=document.createElement('p');e.className='validation-message';e.textContent='Something went wrong';document.querySelector('main').prepend(e)});
  await page.getByRole('alert').filter({hasText:"We couldn't submit your verification"}).waitFor();
  assert.equal(submissions,0);
  console.log('PASS valid selfie preview and duplicate acceptance guard: '+method);await page.close();
 }
}finally{await browser.close()}
