import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:792}})
 let requests=0
 page.on('request',r=>{if(/\/totp_consent|\/upload/.test(r.url())) requests++})
 if(!process.env.SMILE_LAYOUT_LIVE) await page.route('https://hashkey-paylink.onrender.com/pocket/identity-frame',r=>r.fulfill({contentType:'text/html',body:readFileSync('vendor/smile-id/biometric-kyc.html','utf8')}))
 await page.goto('https://hashkey-paylink.onrender.com/pocket/identity-frame')
 await page.evaluate(()=>customElements.whenDefined('totp-consent'))
 await page.locator('main').evaluate(main=>{for(const child of main.children)child.hidden=true;const el=document.createElement('totp-consent');el.id='pocket-fixture';el.setAttribute('theme-color','#171717');main.append(el)})
 const host=page.locator('#pocket-fixture')
 await host.locator('#pocket-input-style').waitFor({state:'attached'})
 const bvn=host.locator('#id_number');await bvn.focus()
 assert.equal(await bvn.evaluate(el=>getComputedStyle(el).outlineColor),'rgb(209, 213, 219)')
 await host.evaluate(el=>{for(const child of el.shadowRoot.children){if(child.tagName!=='STYLE')child.hidden=child.id!=='otp-verification'}el.activeScreen=el.shadowRoot.querySelector('#otp-verification');el.setAttribute('otp-delivery-mode','fixture@example.invalid')})
 const otp=host.locator('#totp-token')
 for(const width of [320,360,390,430]) {
  await page.setViewportSize({width,height:792});await otp.fill('123456');await otp.focus()
  const styles=await otp.evaluate(el=>{const s=getComputedStyle(el);const b=el.getBoundingClientRect();const parent=el.closest('form').getBoundingClientRect();return {outline:s.outlineColor,border:s.borderColor,background:s.backgroundColor,width:b.width,left:b.left,right:b.right,parentLeft:parent.left,parentRight:parent.right,scroll:el.scrollWidth,client:el.clientWidth,letterSpacing:s.letterSpacing}})
  assert.equal(styles.outline,'rgb(209, 213, 219)');assert.equal(styles.background,'rgb(255, 255, 255)')
  assert.ok(styles.left>=16&&styles.right<=width-16&&styles.left>=styles.parentLeft&&styles.right<=styles.parentRight)
  assert.ok(styles.scroll<=styles.client+1);assert.equal(await otp.inputValue(),'123456')
  assert.equal(await page.locator('main').evaluate(el=>el.scrollWidth>el.clientWidth),false)
  if(width===390)await page.screenshot({path:'.codex-temp/smile-otp-layout.png'})
 }
 // Provider rerenders the OTP section when the destination changes.
 await host.evaluate(el=>el.setAttribute('otp-delivery-mode','another@example.invalid'))
 await otp.focus();assert.equal(await otp.evaluate(el=>getComputedStyle(el).outlineColor),'rgb(209, 213, 219)')
 assert.equal(requests,0)
 console.log('PASS real Smile BVN/OTP components: neutral focus, six digits fit within section at 320/360/390/430px, styles survive rerender; no OTP requests or submissions.')
} finally {await browser.close()}
