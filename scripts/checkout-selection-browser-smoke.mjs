import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const css=await checkoutTestCss()
import {mkdir,readFile} from 'node:fs/promises'
import {CHECKOUT_NETWORK_ORDER,checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const options=CHECKOUT_NETWORK_ORDER.flatMap(n=>checkoutStablecoins(n).filter(a=>a.currency==='USD').map(a=>({network:n,asset:a.symbol})))
const checkout={id:'chks_'+'a'.repeat(24),amount:'1.5',merchantName:'Lunchroom',title:'Lunchroom order',expiresAt:new Date(Date.now()+15*60000).toISOString(),defaultNetwork:'base',options}
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import Choice from'./src/components/CheckoutAssetChoice';function Paid(){return <h1>Review payment</h1>}createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route path="/" element={<Choice cash={window.testCash===true} checkout={window.testCheckout||${JSON.stringify(checkout)}} returnUrl="https://store.test"/>}/><Route path="/pay/c/:id" element={<Paid/>}/></Routes></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'auth-fixture',setup(b){b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'fixture'}));b.onResolve({filter:/PocketEmailLogin$/},()=>({path:'login',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({loader:'js',contents:a.path==='auth'?"export const usePrivy=()=>({ready:true,authenticated:true,getAccessToken:async()=> 'fixture-token'});":"export default function Login(){return null}"}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});let submissions=[];const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://checkout.test/**',async r=>{
   if(new URL(r.request().url()).pathname==='/hash-logo-transparent.png')return r.fulfill({contentType:'image/png',body:await readFile('public/hash-logo-transparent.png')})
   if(r.request().url().includes('/api/')){submissions.push(r.request().postDataJSON());await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,selectedCheckoutUrl:'/pay/c/chk_1234567890?attempt=pat_1234567890'})});return}
   await r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
  })
  await page.goto('https://checkout.test/');await page.getByLabel('Payment network').waitFor()
  assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).count(),1)
  assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).locator('img').getAttribute('src'),'/hash-logo-transparent.png')
  assert.equal(await page.getByLabel('Checkout information').locator('strong').innerText(),'Hash PayLink')
  for(const network of CHECKOUT_NETWORK_ORDER){await page.getByLabel('Payment network').selectOption(network);const expected=options.filter(o=>o.network===network).map(o=>o.asset);assert.deepEqual(await page.getByLabel('Payment asset').locator('option').allTextContents(),expected);for(const asset of expected){await page.getByLabel('Payment asset').selectOption(asset);await page.getByRole('heading',{name:'1.5 '+asset,exact:true}).waitFor()}}
  assert.equal(submissions.length,0,'Choosing assets must not create or submit payments')
  await page.getByLabel('Payment network').selectOption('xlayer');await page.getByLabel('Payment asset').selectOption('USDG')
  await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/checkout-selection-'+width+'.png'})
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Review payment'}).waitFor()
  assert.deepEqual(submissions,[{network:'xlayer',asset:'USDG'}]);assert.deepEqual(errors,[])
  await page.close()
 }

 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:900}});const writes=[]
  const local={...checkout,currency:'NGN',amount:'2046.38',defaultNetwork:'polygon',options:options.map(o=>({...o,...(o.network==='base'&&o.asset==='USDC'?{}:{unavailableReason:'This asset cannot fund NGN settlement yet. Choose another payment option.'})}))}
  await page.route('https://checkout.test/**',async r=>{
   if(new URL(r.request().url()).pathname==='/hash-logo-transparent.png')return r.fulfill({contentType:'image/png',body:await readFile('public/hash-logo-transparent.png')})
   if(r.request().url().includes('/api/')){writes.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,selectedCheckoutUrl:'/pay/c/chk_1234567890?attempt=pat_1234567890'})})}
   return r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>window.testCheckout='+JSON.stringify(local)+';</script><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
  })
  await page.goto('https://checkout.test/');await page.getByLabel('Payment network').waitFor()
  assert.equal(await page.getByLabel('Payment network').inputValue(),'base')
  assert.deepEqual(await page.getByLabel('Payment network').locator('option').allTextContents(),['Base'])
  assert.deepEqual(await page.getByLabel('Payment asset').locator('option').allTextContents(),['USDC'])
  assert.match(await page.getByRole('heading',{level:1}).innerText(),/2,046.38/)
  assert.equal(writes.length,0)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.screenshot({path:'output/playwright/ngn-payer-choices-'+width+'.png',fullPage:true})
  await page.getByLabel('Payment network').selectOption('base');await page.getByLabel('Payment asset').selectOption('USDC')
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Review payment'}).waitFor()
  assert.deepEqual(writes,[{network:'base',asset:'USDC'}]);await page.close()
 }

 for(const cash of [false,true]){
  const page=await browser.newPage({viewport:{width:390,height:900}}),writes=[];
  const configured={...checkout,currency:'NGN',amount:'2000',paymentMethods:cash?['cash_balance']:['stablecoins','cash_balance'],options:cash?[]:options.filter(o=>['USDC','USDT'].includes(o.asset))};
  await page.route('https://checkout.test/**',async route=>{
   if(route.request().url().includes('/api/')){writes.push(route.request().postDataJSON());return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,selectedCheckoutUrl:'/pay/c/chk_1234567890?attempt=pat_1234567890'})})}
   if(new URL(route.request().url()).pathname==='/hash-logo-transparent.png')return route.fulfill({contentType:'image/png',body:await readFile('public/hash-logo-transparent.png')});
   return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>window.testCash='+cash+';window.testCheckout='+JSON.stringify(configured)+';</script><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
  });
  await page.goto('https://checkout.test/');
  if(cash)assert.equal(await page.getByLabel('Payment network').count(),0);else{await page.getByLabel('Payment network').selectOption('bsc');await page.getByLabel('Payment asset').selectOption('USDT')}
  assert.equal(writes.length,0);await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Review payment'}).waitFor();assert.deepEqual(writes,[cash?{paymentMethod:'cash_balance',network:'base',asset:'USDC'}:{network:'bsc',asset:'USDT'}]);await page.close();
 }
 console.log('PASS NGN method UI: BNB USDT wallet selection, bank-only cash without receiving-wallet options, explicit Continue and authenticated cash binding.');
}finally{await browser.close()}
console.log('PASS desktop/mobile browser: every stablecoin/network, exact review amount, no write before Continue, one server selection and verified handoff.')

console.log('PASS NGN payer choices on mobile/desktop: only executable routes displayed; NGN order price retained; no provider request until explicit Continue.')
