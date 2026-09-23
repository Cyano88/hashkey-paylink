import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const bundle=await build({stdin:{contents:"import{openSmileFrame}from'./src/pocket/lib/smileFrame';window.openSmileFrame=openSmileFrame",resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,format:'iife'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage()
 await page.route('https://app.hashpaylink.com/',r=>r.fulfill({contentType:'text/html',body:'<body></body>'}))
 await page.route('https://hashkey-paylink.onrender.com/pocket/identity-frame**',r=>r.fulfill({contentType:'text/html',body:`<script>window.addEventListener('message',e=>window.received=e.data);parent.postMessage('SmileIdentity::ChildPageReady','https://app.hashpaylink.com')</script>`}))
 await page.goto('https://app.hashpaylink.com/')
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.evaluate(()=>{window.success=0;window.closeCalls=0;window.errors=0;window.openSmileFrame({token:'fixture-secret',onSuccess:()=>window.success++,onClose:()=>window.closeCalls++,onError:()=>window.errors++})})
 const frame=page.frames().find(f=>f.url().includes('/identity-frame'))??await new Promise(resolve=>page.once('framenavigated',resolve))
 await frame.waitForFunction(()=>!!window.received)
 assert.equal(await frame.evaluate(()=>JSON.parse(window.received).token),'fixture-secret')
 assert.equal(new URL(frame.url()).searchParams.get('capture'),'v11-smile-20260923')
 assert.equal(new URL(frame.url()).searchParams.has('token'),false)
 await page.evaluate(()=>{
  const source=document.querySelector('iframe').contentWindow
  window.dispatchEvent(new MessageEvent('message',{origin:'https://evil.invalid',source,data:'SmileIdentity::Success'}))
  window.dispatchEvent(new MessageEvent('message',{origin:'https://hashkey-paylink.onrender.com',source:window,data:'SmileIdentity::Success'}))
  window.dispatchEvent(new MessageEvent('message',{origin:'https://hashkey-paylink.onrender.com',source,data:{message:42}}))
 })
 assert.equal(await page.evaluate(()=>window.success),0)
 await frame.evaluate(()=>{parent.postMessage('SmileIdentity::Success','https://app.hashpaylink.com');parent.postMessage('SmileIdentity::Success','https://app.hashpaylink.com')})
 await page.waitForFunction(()=>window.success===1)
 await frame.evaluate(()=>parent.postMessage('SmileIdentity::Close::System','https://app.hashpaylink.com'))
 await page.waitForFunction(()=>!document.querySelector('iframe'))
 assert.deepEqual(await page.evaluate(()=>[window.success,window.closeCalls,window.errors]),[1,0,0])
 console.log('PASS trusted frame handshake, token excluded from URL, spoofed messages rejected, malformed messages ignored, one upload callback, and cleanup.')
} finally {await browser.close()}
