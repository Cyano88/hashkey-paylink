import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import {checkoutTestCss} from './checkout-test-css.mjs'
import {pocketStoreUrl} from '../src/lib/pocketStoreUrl.ts'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const listing='https://play.google.com/store/apps/details?id=com.hashpaylink.pocket'
const testing='https://play.google.com/apps/testing/com.hashpaylink.pocket'
for(const url of [listing,testing])assert.equal(pocketStoreUrl(url),url)
for(const url of ['https://evil.test',testing+'/fake','https://user@play.google.com/apps/testing/com.hashpaylink.pocket','https://play.google.com/store/apps/details?id=other'])assert.equal(pocketStoreUrl(url),'')
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Choice from'./src/components/CheckoutChoice';createRoot(document.getElementById('root')).render(<MemoryRouter><Choice id='chks_aaaaaaaaaaaaaaaaaaaaaaaa' attempt='att_fixture' merchant='Lunchroom' amount='NGN 2,046.38' expiresAt={new Date(Date.now()+600000).toISOString()} onBrowser={()=>document.body.dataset.web='yes'}/></MemoryRouter>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const css=await checkoutTestCss()
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
for(const theme of ['light','dark'])for(const test of [{width:320,fallback:false,store:listing},{width:390,fallback:true,store:testing},{width:390,fallback:true,store:''},{width:390,fallback:false,store:listing},{width:1280,fallback:false,store:listing}]){
 const p=await browser.newPage({viewport:{width:test.width,height:844},userAgent:test.width===390?'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0.0.0 Mobile Safari/537.36':undefined})
 const errors=[];const writes=[];p.on('pageerror',e=>errors.push(e.message))
 await p.route('https://checkout.test/**',async r=>{
  if(r.request().method()!=='GET')writes.push(r.request().url())
  if(r.request().url().includes('/api/'))return r.fulfill({json:{playStoreUrl:test.store}})
  if(new URL(r.request().url()).pathname==='/hash-logo-transparent.png')return r.fulfill({contentType:'image/png',body:await readFile('public/hash-logo-transparent.png')})
  const path=new URL(r.request().url()).pathname
  if(['/brand/payments/apple-pay.svg','/brand/payments/google-pay.svg'].includes(path))return r.fulfill({contentType:'image/svg+xml',body:await readFile('public'+path)})
  if(r.request().resourceType()==='image')return r.fulfill({status:404,body:''})
  return r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})
 })
 await p.clock.install()
 await p.goto('https://checkout.test/pay/c/chks_aaaaaaaaaaaaaaaaaaaaaaaa'+(test.fallback?'?pocketFallback=1':''))
 await p.evaluate(theme=>document.documentElement.classList.toggle('dark',theme==='dark'),theme)
 const pageUrl=p.url()
 const timer=p.getByText(/^Time left /)
 await timer.waitFor()
 if(!test.fallback){
  assert.equal(await p.getByRole('button',{name:'Back',exact:true}).count(),0)
  assert.equal(await p.getByRole('button',{name:'Pay on web',exact:true}).count(),0)
  for(const name of ['Card','Google Pay','Apple Pay','Bank transfer'])assert.equal(await p.getByRole('button',{name:new RegExp('^'+name+' .*Coming soon$')}).isDisabled(),true)
  await p.getByRole('button',{name:'Stablecoins',exact:true}).click()
 }
 const back=p.getByRole('button',{name:'Back',exact:true})
 await back.waitFor()
 const before=await timer.textContent()
 const backBox=await back.boundingBox(),amountBox=await p.getByRole('heading',{level:1}).boundingBox()
 assert.ok(backBox.height>=44&&backBox.y<amountBox.y,'Back is above order details with a 44px target')
 await p.clock.fastForward(3000)
 await back.click()
 assert.equal(await p.getByRole('button',{name:'Stablecoins',exact:true}).evaluate(el=>el===document.activeElement),true)
 assert.notEqual(await timer.textContent(),before,'going back must not reset the countdown')
 assert.equal(p.url(),pageUrl,'navigation retains checkout and attempt URL')
 assert.equal(await p.locator('body').getAttribute('data-web'),null)
 await p.getByRole('button',{name:'Stablecoins',exact:true}).click()
 assert.equal(await back.evaluate(el=>el===document.activeElement),true)
 if(test.fallback){
  const cta=p.getByRole('link',{name:test.store?'Get Pocket':'Try opening Pocket',exact:true});await cta.waitFor()
  if(test.store)assert.equal(await cta.getAttribute('href'),testing)
  assert.equal(await p.locator('svg[width="160"]').count(),0)
 }else{
  const cta=p.getByRole('link',{name:'Pay with Pocket',exact:true});await cta.waitFor()
  if(test.width===390)assert.match(await cta.getAttribute('href'),/pocketFallback%3D1/)
  else{await cta.click();await p.getByText('Scan with Pocket to review this payment.',{exact:false}).waitFor();assert.ok(await p.locator('svg[width="160"]').count()>0)}
 }
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'payment methods must fit the viewport')
 await p.getByRole('heading',{name:'Pay with stablecoins'}).waitFor()
 await mkdir('output/playwright',{recursive:true});await p.screenshot({path:'output/playwright/pocket-fallback-'+theme+'-'+test.width+'-'+test.fallback+'-'+Boolean(test.store)+'.png',fullPage:true})
 await p.getByRole('button',{name:'Pay on web',exact:true}).click()
 assert.equal(await p.locator('body').getAttribute('data-web'),'yes')
 await p.clock.fastForward(600000)
 await p.getByRole('heading',{name:'Payment session expired',exact:true}).waitFor()
 assert.equal(await p.getByRole('button',{name:'Back',exact:true}).count(),0)
 assert.deepEqual(writes,[]);assert.deepEqual(errors,[])
 await p.close()
}
console.log('PASS mobile intent fallback, configured testing link, missing-link retry, desktop QR and web continuation; no payment writes.')
}finally{await browser.close()}
