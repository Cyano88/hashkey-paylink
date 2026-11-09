import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const parent='chks_'+'a'.repeat(24)
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route}from'react-router-dom';import Entry from './src/pages/HostedCheckoutEntry';createRoot(document.getElementById('root')).render(<BrowserRouter><Routes><Route path='/pay/c/:checkoutId' element={<Entry/>}/><Route path='/pay' element={<h1>Verified payment result</h1>}/></Routes></BrowserRouter>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',plugins:[{name:'payment-leaves',setup(b){b.onResolve({filter:/CheckoutAssetChoice$|BscCheckoutPage$|PocketXPayCheckoutPage$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),loader:'jsx',contents:'export default function View(){return <h1>Browser payment form</h1>}'}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const rail of ['circle','bsc','xlayer']){
  const page=await browser.newPage();await page.clock.install()
  const child=rail==='circle'?'chk_1234567890':(rail==='bsc'?'chkb_':'chkx_')+'b'.repeat(24)
  let selected=false,method='stablecoins',status='pending',reads=0,error=false,expired=false
  const writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://handoff.test/**',r=>{
   const url=new URL(r.request().url());if(r.request().method()!=='GET')writes.push(url.href)
   if(url.pathname==='/api/pocket/checkout-config')return r.fulfill({json:{playStoreUrl:'https://play.google.com/apps/internaltest/4701069716962238662'}})
   if(url.pathname==='/api/v2/checkouts'){
    reads++;if(error)return r.fulfill({status:503,json:{ok:false,error:'Checkout temporarily unavailable.'}})
    const common={amount:'1.5',asset:'USDC',merchantName:'Lunchroom',expiresAt:new Date(Date.now()+(expired?-1000:600000)).toISOString(),status}
    return r.fulfill({json:url.searchParams.get('id')===parent?{ok:true,checkout:{...common,id:parent,selectionCheckout:true,paymentMethods:['stablecoins','cash_balance'],paymentMethod:method,options:[{network:'base',asset:'USDC'}],canChange:status==='pending',...(selected?{selectedCheckoutId:child}:{})},...(selected?{selectedCheckoutUrl:'/pay/c/'+child+'?attempt=attempt123'}:{})}:{ok:true,checkout:{...common,id:child,...(rail==='bsc'?{bscCheckout:true}:rail==='xlayer'?{stockCheckout:true}:{})},paymentUrl:'/pay?checkout='+child}})
   }
   if(r.request().resourceType()==='image')return r.fulfill({status:404,body:''})
   return r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})
  })
  const qr=page.locator('svg').filter({has:page.locator('path')}) // actual QR is also asserted by status and link below
  const waiting=page.getByRole('status').filter({hasText:'Scan with Pocket'})
  await page.goto('https://handoff.test/pay/c/'+parent)
  await page.getByRole('button',{name:/Stablecoins/}).click()
  await page.getByRole('link',{name:'Pay with Pocket',exact:true}).click()
  await waiting.waitFor();assert.equal(new URL(page.url()).searchParams.get('mode'),'pocket')
  selected=true;await page.clock.runFor(10001);await waiting.waitFor()
  assert.equal(new URL(page.url()).pathname,'/pay/c/'+parent,'phone route selection must retain parent')
  assert((await page.getByRole('link',{name:'Pay with Pocket',exact:true}).getAttribute('href')).includes('/'+parent+'?method=stablecoins'))
  await page.reload();await waiting.waitFor();assert(await qr.count()>0)
  method='cash_balance';await page.clock.runFor(10001);await page.getByRole('heading',{name:'Pay with cash balance',exact:true}).waitFor();await waiting.waitFor()
  assert((await page.getByRole('link',{name:'Pay with Pocket',exact:true}).getAttribute('href')).includes('method=cash_balance'))
  method='stablecoins';await page.clock.runFor(10001);await page.getByRole('heading',{name:'Pay with stablecoins',exact:true}).waitFor()
  await page.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await waiting.count(),0)
  await page.getByRole('button',{name:/Stablecoins/}).waitFor();assert.equal(new URL(page.url()).searchParams.get('mode'),null)
  await page.getByRole('button',{name:/Stablecoins/}).click();await page.getByRole('link',{name:'Pay with Pocket',exact:true}).click();await waiting.waitFor()
  await page.getByRole('button',{name:'Pay on web',exact:true}).click()
  if(rail==='circle')await page.getByRole('heading',{name:'Verified payment result'}).waitFor()
  else await page.getByRole('heading',{name:'Browser payment form'}).waitFor()
  assert.equal(await waiting.count(),0)
  await page.goto('https://handoff.test/pay/c/'+parent+'?mode=pocket');await waiting.waitFor()
  expired=true;await page.reload();await page.getByRole('heading',{name:'Payment session expired'}).waitFor();assert.equal(await waiting.count(),0)
  expired=false;await page.reload();await waiting.waitFor()
  error=true;await page.clock.runFor(10001);await page.getByRole('heading',{name:'Checkout unavailable'}).waitFor();assert.equal(await waiting.count(),0,'failed polling must not masquerade as waiting')
  error=false;await page.reload();await waiting.waitFor()
  status='paid';await page.clock.runFor(10001)
  if(rail==='circle')await page.getByRole('heading',{name:'Verified payment result'}).waitFor()
  else if(rail==='bsc')await page.getByRole('heading',{name:'Browser payment form'}).waitFor()
  else await page.getByRole('heading',{name:'Successful',exact:true}).waitFor()
  const stoppedReads=reads;await page.clock.runFor(30000);assert.equal(reads,stoppedReads)
  assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS actual desktop QR persists through route selection, reload, cash/stablecoin switches; Back exits; polling errors surface; verified completion stops reads across Circle/BNB/X Layer; no writes.')
}finally{await browser.close()}

