import assert from 'node:assert/strict'
import {readFileSync,existsSync} from 'node:fs'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from './src/pocket/pages/PocketUnifiedXPayPage';import Gate from './src/pocket/components/PocketPaymentSecurityGate';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[{pathname:'/xpay',state:{xpayOrigin:'stablecoins'}}]}><Gate email="fixture@example.invalid" getAccessToken={async()=>"fixture"}><Page/></Gate></MemoryRouter>)`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'boundaries',setup(b){
 const resetOnly={pocketAccountState:'clearPocketAccountOperationState',pocketSecureWalletSession:'deletePocketSecureWalletSession',pocketPushPreference:'unregisterPocketPushDevice',pocketQuickApproval:'disablePocketQuickApproval',usePocketSessionSplash:'resetPocketSessionSplash'}
 b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();return a.importer.endsWith('PocketPaymentSecurityGate.tsx')&&resetOnly[key]?{path:key,namespace:'reset-boundary'}:undefined})
 b.onLoad({filter:/.*/,namespace:'reset-boundary'},a=>({contents:'export const '+resetOnly[a.path]+'=async()=>{}'}))

 b.onLoad({filter:/[\\/]pocketPaymentSecurityClient\.tsx?$/},()=>({contents:"export const readPocketPaymentSecurity=async()=>({configured:true,pinLength:4});export const verifyPocketPaymentPin=async()=>({approvalToken:'fixture-approval',expiresAt:Date.now()+60000,authorization:'Bearer fixture'});export const updatePocketPaymentSecurity=async()=>({});export const beginPocketPaymentPinReset=async()=>({});export const checkPocketPaymentPinReset=async()=>({eligible:true})"}))
 b.onLoad({filter:/[\\/]pocketPaymentBiometrics\.tsx?$/},()=>({contents:"export const pocketPaymentBiometricsEnabled=()=>false;export const pocketPaymentBiometricsAvailable=async()=>false;export const pocketPaymentBiometricsConfigured=()=>true;export const readPocketPinWithBiometrics=async()=>null;export const enablePocketPaymentBiometrics=async()=>{};export const disablePocketPaymentBiometrics=async()=>{}"}))
 b.onLoad({filter:/[\\/]usePocketWallets\.tsx?$/},()=>({contents:"export default()=>({wallets:Object.fromEntries(['base','arbitrum','arc','ethereum','polygon','solana'].map(n=>[n,{address:'fixture'}]))})"}))
 b.onLoad({filter:/[\\/]usePocketIdentity\.tsx?$/},()=>({contents:"export default()=>({authenticated:true,user:{id:'fixture'},getAccessToken:async()=>'fixture'})"}))
 b.onLoad({filter:/[\\/](PocketXPayNativePayment|PocketXPayNativeStockPayment|PocketXPayBankCheckout|PocketKycPrompt|PocketActivityPanel|PocketPaymentSuccess)\.tsx$/},()=>({contents:'export default()=>null'}))
 b.onLoad({filter:/[\\/]PocketUnifiedXPaySetup\.tsx$/},()=>({contents:'import {createElement} from "react";export const XPayBankSetup=({onCreated})=>createElement("button",{onClick:()=>onCreated("replacement-bank").catch(()=>{})},"Receiving account setup");export const XPayWalletSetup=()=>null'}))
}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const width of [320,390])for(const dark of [false,true]){
  const bank={id:'bank',name:'Example restaurant',kind:'bank',currency:'NGN',assets:['USDC'],networks:['base'],revision:'1'}
  let checkout={id:'xp_11111111-1111-4111-8111-111111111111',name:'Example restaurant',version:0,createdAt:1,destinations:[bank]},coinWrites=0,writes=0,setups=0,fail=false
  const p=await browser.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.route('https://pocket.hashpaylink.com/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/api/pocket/xpay'){
    const body=route.request().postDataJSON()
    if(body.action==='mine')return route.fulfill({json:{ok:true,hostedNetworks:['xlayer','bsc','base','arbitrum','solana','ethereum','polygon'],destinations:[...checkout.destinations,{...bank,id:'replacement-bank'}],checkouts:[checkout],standaloneIds:[]}})
    if(body.action==='receiving-account')return route.fulfill({json:{ok:true,account:{currency:'NGN',bankName:'Fixture Bank',accountName:'Example owner',accountNumber:checkout.destinations.some(d=>d.id==='replacement-bank')?'9876543210':'0123456789'}}})
    if(body.action==='begin-setup'){assert.equal(body.kind,'bank');setups++;return route.fulfill({json:{ok:true,key:'fixture-setup'}})}
    assert.equal(route.request().headers()['x-pocket-payment-approval'],'fixture-approval')
    if(body.action==='configure-coin'){
     coinWrites++;await new Promise(resolve=>setTimeout(resolve,200))
     if(fail)return route.fulfill({status:409,json:{ok:false,error:'This terminal changed. Reopen it before saving.'}})
     assert.equal(body.asset,'USDT');assert.deepEqual(body.networks.sort(),['arbitrum','base','bsc','ethereum','polygon','solana','xlayer']);assert.equal(body.version,checkout.version)
     const hosts=['base','arbitrum','solana','ethereum','polygon','bsc','xlayer'].map(adapter=>({id:adapter,adapter,kind:'stablecoins',name:checkout.name,currency:'USD',assets:['USDT'],networks:[adapter],revision:'1'}))
     checkout={...checkout,version:checkout.version+1,destinations:[bank,...hosts],acceptance:{version:1,cashBalance:false,routes:[{destinationId:'bank',revision:'1',network:'base',asset:'USDC'},...hosts.map(d=>({destinationId:d.id,revision:d.revision,network:d.adapter,asset:'USDT'}))]}}
     return route.fulfill({json:{ok:true,checkout}})
    }
    assert.equal(body.action,'configure');writes++;checkout={...checkout,version:checkout.version+1,destinations:[...checkout.destinations,{...bank,id:'replacement-bank'}].filter(d=>body.destinationIds.includes(d.id))};return route.fulfill({json:{ok:true,checkout}})
   }
   if(path.startsWith('/api/'))return route.fulfill({json:{ok:true}})
   if(path.startsWith('/brand/')&&existsSync('public'+path))return route.fulfill({body:readFileSync('public'+path),contentType:path.endsWith('.svg')?'image/svg+xml':path.endsWith('.png')?'image/png':'image/jpeg'})
   return route.fulfill({contentType:'text/html',body:`<html class="${dark?'dark':''}"><style>html,body,#root{height:100%;margin:0}${css}</style><div id="root"></div></html>`})
  })
  await p.goto('https://pocket.hashpaylink.com');await p.addScriptTag({content:bundle.outputFiles[0].text});await p.getByRole('button',{name:'Example restaurant',exact:true}).click();await p.getByRole('button',{name:'Payment options',exact:true}).click();await p.getByRole('button',{name:'Accepted payments',exact:true}).click()
  assert.equal(await p.getByRole('dialog').count(),0);assert.equal(await p.getByRole('button',{name:/Coming soon/}).count(),6)
  await p.getByRole('button',{name:'Stablecoins',exact:true}).click();for(const coin of ['USDC','USDT','USDe','USDG'])assert(await p.getByRole('button',{name:coin,exact:true}).isVisible())
  await p.locator('img').evaluateAll(async images=>Promise.all(images.map(image=>image.decode())))
  assert(await p.getByLabel('Stablecoins',{exact:true}).locator('img').evaluateAll(xs=>xs.every(x=>getComputedStyle(x).filter.includes('grayscale(1)'))))
  await p.screenshot({path:'.codex-temp/xpay-coins-'+width+'-'+(dark?'dark':'light')+'.png'})
  for(const [coin,count,disabled] of [['USDC',8,0],['USDT',7,0],['USDe',1,0],['USDG',1,0]]){
   await p.getByRole('button',{name:coin,exact:true}).click();await p.getByRole('heading',{name:coin,exact:true}).waitFor();assert.equal(await p.getByRole('checkbox').count(),count);assert.equal(await p.getByRole('checkbox',{disabled:true}).count(),disabled);assert.equal(await p.getByRole('checkbox',{checked:true}).count(),0);await p.getByRole('button',{name:'Back',exact:true}).click()
  }
  await p.getByRole('button',{name:'USDT',exact:true}).click();await p.getByRole('checkbox',{name:'Receive USDT on BNB Chain',exact:true}).check();await p.getByRole('checkbox',{name:'Receive USDT on X Layer',exact:true}).check();for(const name of ['Base','Arbitrum','Solana','Ethereum','Polygon'])await p.getByRole('checkbox',{name:'Receive USDT on '+name,exact:true}).check()
  const save=p.getByRole('button',{name:'Save changes',exact:true}),pin=p.getByRole('dialog',{name:'Enter Pocket PIN',exact:true});const before=await save.boundingBox();await p.getByRole('group',{name:'Receiving networks'}).evaluate(el=>el.scrollTop=el.scrollHeight);assert(Math.abs((await save.boundingBox()).y-before.y)<1)
  await save.click();const savingStatus=p.getByRole('status',{name:'Saving receiving networks'});assert.deepEqual([...await savingStatus.textContent()].map(c=>c.codePointAt(0)),[83,97,118,105,110,103]);assert.equal(await savingStatus.locator('.animate-spin').count(),1);assert.equal(await savingStatus.locator('.animate-pulse').count(),0);await pin.getByText('Enter your PIN to save changes.',{exact:true}).waitFor();await pin.getByRole('button',{name:'Close',exact:true}).click();await pin.waitFor({state:'detached'});assert.equal(coinWrites,0);assert.equal(await p.getByRole('alert').count(),0)
  await save.evaluate(el=>{el.click();el.click()});await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click();await p.getByRole('heading',{name:'Stablecoins',exact:true}).waitFor();assert.equal(coinWrites,1)
  await p.getByRole('button',{name:'USDT',exact:true}).click();assert.equal(await p.getByRole('checkbox',{checked:true}).count(),7);await p.getByRole('checkbox',{name:'Receive USDT on X Layer',exact:true}).uncheck();fail=true;await save.click();await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(coinWrites,2);const err=await p.getByRole('alert').boundingBox();assert(err.y+err.height<=(await save.boundingBox()).y)
  await p.evaluate(()=>document.dispatchEvent(new Event('pocket:native-back',{bubbles:true,cancelable:true})));await p.getByRole('button',{name:'USDT',exact:true}).click();assert.equal(await p.getByRole('checkbox',{checked:true}).count(),6);await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click()
  await p.getByRole('button',{name:'Receive fiat',exact:true}).click();await p.getByLabel('Saved receiving account',{exact:true}).waitFor();await p.getByText('0123456789',{exact:true}).waitFor();assert.equal(setups,0);await p.getByRole('button',{name:'Edit receiving account',exact:true}).click();await p.getByRole('button',{name:'Receiving account setup',exact:true}).click();await pin.getByRole('button',{name:'Close',exact:true}).click();await pin.waitFor({state:'detached'});assert.equal(writes,0);await p.getByRole('button',{name:'Receiving account setup',exact:true}).click();await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click();await p.getByText('9876543210',{exact:true}).waitFor();assert.equal(writes,1)
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await p.close()
 }
 console.log('PASS neutral coin-first XPay: eight USDC networks, seven USDT networks, USDe/USDG X Layer, server-gated routes, real PIN cancellation/single save, draft Back, fixed CTA/errors and saved fiat regression; 320/390 light/dark.')
}finally{await browser.close()}
