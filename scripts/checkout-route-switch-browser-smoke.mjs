import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const checkout={id:'chks_'+'1'.repeat(24),selectedCheckoutId:'chk_'+'2'.repeat(24),amount:'2.29',merchantName:'Builder',expiresAt:new Date(Date.now()+600000).toISOString(),selected:{network:'base',asset:'USDT'},canChange:true,options:['base','bsc','xlayer'].flatMap(network=>['USDC','USDT'].map(asset=>({network,asset})))}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useLocation}from'react-router-dom';import Change from './src/components/CheckoutPaymentChange';import Choice from './src/components/CheckoutAssetChoice';function Current(){const[busy,setBusy]=React.useState(false);window.busy=setBusy;return <><p>Signed in: buyer</p><Change id="${checkout.selectedCheckoutId}" busy={busy}/></>}function Selection(){return <Choice checkout={${JSON.stringify(checkout)}}/>}function Done(){const loc=useLocation();return <h1>{loc.pathname}</h1>}createRoot(document.getElementById('root')).render(<MemoryRouter><Routes><Route path="/" element={<Current/>}/><Route path="/pay/c/${checkout.id}" element={<Selection/>}/><Route path="/pay/c/:child" element={<Done/>}/></Routes></MemoryRouter>);`
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{for(const network of ['bsc','xlayer','base']){
 const page=await browser.newPage({viewport:{width:390,height:844}});const writes=[];let loads=0
 await page.route('https://checkout.test/**',r=>{
  const url=new URL(r.request().url());if(url.pathname.startsWith('/api/')){
   if(r.request().method()==='GET')return r.fulfill({json:{ok:true,selection:{id:checkout.id,canChange:true}}})
   writes.push(r.request().postDataJSON());return r.fulfill({json:{ok:true,selectedCheckoutUrl:'/pay/c/chkb_'+'3'.repeat(24)}})
  }
  if(!r.request().isNavigationRequest())return r.fulfill({status:204,body:''})
  loads++;return r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
 })
 await page.goto('https://checkout.test/');await page.getByRole('button',{name:'Change payment network'}).waitFor()
 await page.evaluate(()=>window.busy(true));assert(await page.getByRole('button',{name:'Change payment network'}).isDisabled())
 await page.evaluate(()=>window.busy(false));await page.getByRole('button',{name:'Change payment network'}).click()
 assert.equal(await page.getByLabel('Payment network').isDisabled(),false)
 assert.equal(await page.getByLabel('Payment asset').inputValue(),'USDT')
 await page.getByLabel('Payment network').selectOption(network);assert.equal(await page.getByLabel('Payment asset').inputValue(),'USDT','Retain the stablecoin when the new network supports it')
 assert.equal(writes.length,0,'Network edits never sign or pay')
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('heading',{name:'/pay/c/chkb_'+'3'.repeat(24)}).waitFor()
 assert.deepEqual(writes,[{network,asset:'USDT',expectedCheckoutId:checkout.selectedCheckoutId}]);assert.equal(loads,1,'Changing network must not reload the authenticated app')
 await page.close()
}}finally{await browser.close()}
console.log('PASS change-network action, busy lock, selected route remains editable, stablecoin preserved, stale-tab reference submitted, client navigation without sign-in reload; zero payment submissions.')
