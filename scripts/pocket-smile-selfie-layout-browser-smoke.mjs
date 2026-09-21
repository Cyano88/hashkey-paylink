import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:792}})
 await page.route('https://hashkey-paylink.onrender.com/pocket/identity-frame',r=>r.fulfill({contentType:'text/html',body:readFileSync('vendor/smile-id/biometric-kyc.html','utf8')}))
 await page.goto('https://hashkey-paylink.onrender.com/pocket/identity-frame')
 await page.evaluate(()=>customElements.whenDefined('smart-camera-web'))
 await page.locator('main').evaluate(el=>{for(const child of el.children){if(child.id!=='camera-container')child.setAttribute('hidden','')}el.querySelector('smart-camera-web').removeAttribute('hidden')})
 await page.getByText("Next, we'll take a quick selfie",{exact:false}).waitFor()
 for(const width of [360,390,430]) {
  await page.setViewportSize({width,height:792})
  const component=await page.locator('smart-camera-web').boundingBox()
  assert.ok(component.x>=16&&component.x+component.width<=width-16)
  assert.equal(await page.locator('main').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  for(const name of ['Allow','Cancel']) {
   const button=page.getByRole('button',{name,exact:true});await button.scrollIntoViewIfNeeded()
   const rect=await button.boundingBox();assert.ok(rect.x>=16&&rect.x+rect.width<=width-16&&rect.y>=0&&rect.y+rect.height<=793)
  }
  await page.locator('main').evaluate(el=>el.scrollTop=0)
  const heading=await page.getByText("Next, we'll take a quick selfie",{exact:false}).boundingBox();assert.ok(heading.x>=16&&heading.x+heading.width<=width-16&&heading.y>=0)
 }
 console.log('PASS actual Smile selfie instructions: 360/390/430px, safe side margins, no horizontal overflow, heading and both actions reachable without camera permission or identity submission.')
} finally {await browser.close()}
