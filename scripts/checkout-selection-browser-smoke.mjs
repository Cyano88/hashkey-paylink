import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir} from 'node:fs/promises'
import {CHECKOUT_NETWORK_ORDER,checkoutStablecoins} from '../src/lib/checkoutStablecoins.ts'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const options=CHECKOUT_NETWORK_ORDER.flatMap(n=>checkoutStablecoins(n).filter(a=>a.currency==='USD').map(a=>({network:n,asset:a.symbol})))
const checkout={id:'chks_'+'a'.repeat(24),amount:'1.5',merchantName:'Lunchroom',title:'Lunchroom order',expiresAt:new Date(Date.now()+15*60000).toISOString(),defaultNetwork:'base',options}
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import Choice from'./src/components/CheckoutAssetChoice';function Paid(){return <h1>Review payment</h1>}createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route path="/" element={<Choice checkout={${JSON.stringify(checkout)}} returnUrl="https://store.test"/>}/><Route path="/pay/c/:id" element={<Paid/>}/></Routes></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 for(const width of [390,1280]){
  const page=await browser.newPage({viewport:{width,height:844}});let submissions=[];const errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://checkout.test/**',async r=>{
   if(r.request().url().includes('/api/')){submissions.push(r.request().postDataJSON());await r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,selectedCheckoutUrl:'/pay/c/chk_1234567890?attempt=pat_1234567890'})});return}
   await r.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
  })
  await page.goto('https://checkout.test/');await page.getByLabel('Payment network').waitFor()
  for(const network of CHECKOUT_NETWORK_ORDER){await page.getByLabel('Payment network').selectOption(network);const expected=options.filter(o=>o.network===network).map(o=>o.asset);assert.deepEqual(await page.getByLabel('Payment asset').locator('option').allTextContents(),expected);for(const asset of expected){await page.getByLabel('Payment asset').selectOption(asset);await page.getByRole('heading',{name:'1.5 '+asset,exact:true}).waitFor()}}
  assert.equal(submissions.length,0,'Choosing assets must not create or submit payments')
  await page.getByLabel('Payment network').selectOption('xlayer');await page.getByLabel('Payment asset').selectOption('USDG')
  await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/checkout-selection-'+width+'.png'})
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'Review payment'}).waitFor()
  assert.deepEqual(submissions,[{network:'xlayer',asset:'USDG'}]);assert.deepEqual(errors,[])
  await page.close()
 }
}finally{await browser.close()}
console.log('PASS desktop/mobile browser: every stablecoin/network, exact review amount, no write before Continue, one server selection and verified handoff.')
