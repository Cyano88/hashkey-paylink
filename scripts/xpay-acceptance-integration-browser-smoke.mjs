import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from './src/pocket/pages/PocketUnifiedXPayPage';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[{pathname:'/xpay',state:{xpayOrigin:'stablecoins'}}]}><Page/></MemoryRouter>)`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'boundaries',setup(b){
 b.onLoad({filter:/[\\/]usePocketIdentity\.tsx?$/},()=>({contents:"export default()=>({authenticated:true,user:{id:'fixture'},getAccessToken:async()=>'fixture'})"}))
 b.onLoad({filter:/[\\/]pocketPaymentApproval\.tsx?$/},()=>({contents:"export const requestPocketPaymentApproval=async()=>{};export const takePocketPaymentApproval=()=>({token:'fixture-approval',authorization:'Bearer fixture'})"}))
 b.onLoad({filter:/[\\/](PocketXPayNativePayment|PocketXPayNativeStockPayment|PocketXPayBankCheckout|PocketXPayUsdcSetup|PocketKycPrompt|PocketActivityPanel|PocketPaymentSuccess)\.tsx$/},()=>({contents:'export default()=>null'}))
 b.onLoad({filter:/[\\/]PocketUnifiedXPaySetup\.tsx$/},()=>({contents:'export const XPayBankSetup=()=>null;export const XPayWalletSetup=()=>null'}))
}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const width of [320,390])for(const dark of [false,true]){
  const destination={id:'fixture-wallet',name:'Example restaurant',kind:'stablecoins',currency:'USDC',assets:['USDC'],networks:['base','arbitrum','arc','ethereum','polygon','solana'],revision:'1'}
  let checkout={id:'xp_11111111-1111-4111-8111-111111111111',name:'Example restaurant',version:0,createdAt:1,destinations:[destination]},writes=0,fail=false
  const p=await browser.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.route('https://pocket.hashpaylink.com/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/api/pocket/xpay'){
    const body=route.request().postDataJSON()
    if(body.action==='mine')return route.fulfill({json:{ok:true,destinations:[destination],checkouts:[checkout],standaloneIds:[]}})
    assert.equal(body.action,'configure');assert.equal(route.request().headers()['x-pocket-payment-approval'],'fixture-approval');writes++
    await new Promise(resolve=>setTimeout(resolve,250))
    if(fail)return route.fulfill({status:409,json:{ok:false,error:'This terminal changed. Reopen it before saving.'}})
    assert.equal(body.version,checkout.version);checkout={...checkout,version:checkout.version+1,acceptance:body.acceptance}
    return route.fulfill({json:{ok:true,checkout}})
   }
   if(path.startsWith('/api/'))return route.fulfill({json:{ok:true}})
   if(path.startsWith('/brand/')&&existsSync('public'+path))return route.fulfill({body:readFileSync('public'+path),contentType:path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/jpeg'})
   return route.fulfill({contentType:'text/html',body:`<html class="${dark?'dark':''}"><style>html,body,#root{height:100%;margin:0}${css}</style><div id="root"></div></html>`})
  })
  await p.goto('https://pocket.hashpaylink.com');await p.addScriptTag({content:bundle.outputFiles[0].text})
  await p.getByRole('button',{name:'Example restaurant',exact:true}).click()
  await p.getByRole('button',{name:'Payment options',exact:true}).click()
  const open=()=>p.getByRole('button',{name:'Accepted payments',exact:true}).click()
  await open();let dialog=p.getByRole('dialog',{name:'Accepted payments',exact:true})
  await dialog.getByRole('heading',{name:'Accepted payments',exact:true}).waitFor()
  assert.equal(await dialog.getByRole('checkbox').count(),6)
  await dialog.locator('img').evaluateAll(async images=>Promise.all(images.map(image=>image.decode())))
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await p.screenshot({path:'.codex-temp/xpay-integrated-'+width+'-'+(dark?'dark':'light')+'.png'})
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await dialog.waitFor({state:'detached'})
  await open();await p.evaluate(()=>document.dispatchEvent(new Event('pocket:native-back',{bubbles:true,cancelable:true})));await dialog.waitFor({state:'detached'})
  await open();for(const box of await dialog.getByRole('checkbox').all())await box.uncheck()
  assert(await dialog.getByRole('button',{name:'Save changes'}).isDisabled())
  await dialog.getByRole('checkbox',{name:'Accept USDC on Arbitrum',exact:true}).check()
  await dialog.getByRole('button',{name:'Save changes'}).evaluate(el=>{el.click();el.click()})
  await dialog.getByRole('status',{name:'Saving payment options'}).waitFor()
  assert(await dialog.getByRole('button',{name:'Close',exact:true}).isDisabled())
  await dialog.waitFor({state:'detached'});assert.equal(writes,1);assert.deepEqual(checkout.acceptance.routes.map(r=>r.network),['arbitrum'])
  await open();assert.equal(await dialog.getByRole('checkbox',{checked:true}).count(),1)
  fail=true;await dialog.getByRole('button',{name:'Save changes'}).click();await dialog.getByRole('alert').waitFor();assert.equal(writes,2)
  await p.keyboard.press('Escape');await dialog.waitFor({state:'detached'})
  await p.getByRole('button',{name:'Done',exact:true}).click();await p.getByRole('button',{name:'Download QR',exact:true}).waitFor()
  assert.deepEqual(errors,[]);await p.close()
 }
 console.log('PASS integrated XPay settings: real page and sheet, six networks, close/native Back/Escape, save/PIN header, duplicate protection, saved-state reopening, failure recovery and QR return; 320/390 light/dark.')
}finally{await browser.close()}
