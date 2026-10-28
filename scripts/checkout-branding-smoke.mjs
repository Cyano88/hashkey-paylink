import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,mkdirSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useEffect}from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route,useOutletContext}from'react-router-dom';import Layout from'./src/surfaces/SurfaceLayout';import Merchant from'./src/components/CheckoutMerchant';import{HashPayLinkCheckoutBrand}from'./src/components/CheckoutChrome';function Child(){const c=useOutletContext();useEffect(()=>c.onPayWalletStateChange({connected:true,disconnect:()=>window.disconnects++}),[]);return <><HashPayLinkCheckoutBrand/><Merchant name="Lunchroom" logo={window.logo}/></>}window.disconnects=0;createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[window.testPath]}><Routes><Route element={<Layout/>}><Route path="*" element={<Child/>}/></Route></Routes></MemoryRouter>);`
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'}})
const css=await checkoutTestCss()
const browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('output/playwright',{recursive:true})
try{
 for(const width of [320,390,1280])for(const dark of [false,true]){
  const page=await browser.newPage({viewport:{width,height:844}})
  await page.route('https://checkout.test/**',route=>{const url=route.request().url();if(url.endsWith('/logo.png'))return route.fulfill({contentType:'image/png',body:readFileSync('public/brand/lunchroom.png')});if(url.endsWith('/hash-logo-transparent.png'))return route.fulfill({contentType:'image/png',body:readFileSync('public/hash-logo-transparent.png')});return route.fulfill({contentType:'text/html',body:'<html><head><style>'+css+'</style></head><body><div id="root"></div></body></html>'})})
  for(const path of ['/pay?checkout=chk_12345678','/pay/c/chkx_12345678','/wallet/stocks/test']){
   await page.goto('https://checkout.test/')
   await page.evaluate(({path,dark})=>{window.testPath=path;window.logo='https://checkout.test/logo.png';document.documentElement.classList.toggle('dark',dark)},{path,dark})
   await page.addScriptTag({content:bundle.outputFiles[0].text})
   await page.getByText('Lunchroom',{exact:true}).waitFor()
   const brand=page.getByLabel('Hash PayLink',{exact:true})
   await brand.waitFor()
   assert.equal(await brand.locator('img').getAttribute('src'),'/hash-logo-transparent.png')
   await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0))
   assert.equal(await page.getByRole('button',{name:'Disconnect',exact:true}).count(),path.startsWith('/wallet/')?1:0)
   if(path.startsWith('/wallet/')){await page.getByRole('button',{name:'Disconnect'}).click();assert.equal(await page.evaluate(()=>window.disconnects),1)}
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
   if(path.startsWith('/pay?'))await page.screenshot({path:'output/playwright/checkout-brand-'+width+(dark?'-dark':'-light')+'.png'})
   await page.locator('img[src="https://checkout.test/logo.png"]').dispatchEvent('error')
   assert.equal(await page.getByText('Lunchroom',{exact:true}).count(),1)
   await page.locator('img[src="https://checkout.test/logo.png"]').waitFor({state:'detached'})
  }
  await page.close()
 }
}finally{await browser.close()}
console.log('Checkout branding: light/dark mobile/desktop, merchant fallback, hosted Disconnect removed, wallet Disconnect retained: passed')
