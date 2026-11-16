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
  const destination={id:'fixture-wallet',name:'Example restaurant',kind:'stablecoins',currency:'USDC',assets:['USDC'],networks:['base','arbitrum','arc','ethereum','polygon','solana'],revision:'1'}
  let checkout={id:'xp_11111111-1111-4111-8111-111111111111',name:'Example restaurant',version:0,createdAt:1,destinations:[destination,{id:'fixture-bank',name:'Example restaurant',kind:'bank',currency:'NGN',assets:['USDC'],networks:['base'],revision:'1'},{id:'old-stock',name:'Historical',kind:'xstocks',currency:'USD',assets:['NVDAx'],revision:'1'}]},writes=0,fail=false,setups=0,reads=0
  const p=await browser.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
  await p.route('https://pocket.hashpaylink.com/**',async route=>{
   const path=new URL(route.request().url()).pathname
   if(path==='/api/pocket/xpay'){
    const body=route.request().postDataJSON()
    if(body.action==='mine')return route.fulfill({json:{ok:true,destinations:[destination,{id:'replacement-bank',kind:'bank',currency:'NGN',assets:['USDC'],networks:['base'],revision:'2'}],checkouts:[checkout],standaloneIds:[]}})
    if(body.action==='receiving-account'){reads++;return route.fulfill({json:{ok:true,account:{currency:'NGN',bankName:'Fixture Bank',accountName:'Example owner',accountNumber:checkout.destinations.some(d=>d.id==='replacement-bank')?'9876543210':'0123456789'}}})}
    if(body.action==='begin-setup'){setups++;assert(['bank','stablecoins'].includes(body.kind));return route.fulfill({json:{ok:true,key:'fixture-fiat-setup'}})}
    assert.equal(body.action,'configure');assert(!body.destinationIds.includes('old-stock'));assert.equal(route.request().headers()['x-pocket-payment-approval'],'fixture-approval');writes++
    await new Promise(resolve=>setTimeout(resolve,250))
    if(fail)return route.fulfill({status:409,json:{ok:false,error:'This terminal changed. Reopen it before saving.'}})
    assert.equal(body.version,checkout.version);checkout={...checkout,destinations:[...checkout.destinations,{id:'replacement-bank',kind:'bank',currency:'NGN',assets:['USDC'],networks:['base'],revision:'2'}].filter(d=>body.destinationIds.includes(d.id)),version:checkout.version+1,acceptance:body.acceptance}
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
  await open();await p.getByRole('heading',{name:'Accepted payments',exact:true}).waitFor()
  assert.equal(await p.getByRole('dialog').count(),0)
  assert.equal(await p.getByRole('button',{name:/Coming soon/}).count(),6)
  assert(await p.getByRole('button',{name:/Coming soon/}).evaluateAll(bs=>bs.every(b=>b.disabled)))
  assert.equal(await p.getByText(/Receive NGN|XStocks/).count(),0)
  await p.locator('img').evaluateAll(async images=>Promise.all(images.map(image=>image.decode())))
  const save=p.getByRole('button',{name:'Save changes',exact:true}),scroll=p.getByLabel('Accepted payment options',{exact:true})
  const fixed=await save.boundingBox();assert(fixed.y+fixed.height<780)
  await scroll.evaluate(el=>el.scrollTop=el.scrollHeight);assert(Math.abs((await save.boundingBox()).y-fixed.y)<1)
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await p.screenshot({path:'.codex-temp/xpay-method-page-'+width+'-'+(dark?'dark':'light')+'.png'})
  await p.getByRole('button',{name:'Stablecoins',exact:true}).click();await p.getByRole('heading',{name:'Stablecoins',exact:true}).waitFor();await p.getByRole('button',{name:'USDC',exact:true}).click();await p.getByRole('heading',{name:'USDC',exact:true}).waitFor()
  assert.equal(await p.getByRole('checkbox').count(),6)
  for(const box of await p.getByRole('checkbox').all())await box.uncheck()
  assert(await p.getByRole('button',{name:'Done',exact:true}).isDisabled())
  await p.getByRole('checkbox',{name:'Accept USDC on Arbitrum',exact:true}).check()
  await p.getByRole('button',{name:'Done',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click()
  await save.click();const pin=p.getByRole('dialog',{name:'Enter Pocket PIN',exact:true});await pin.getByText('Enter your PIN to save changes.',{exact:true}).waitFor()
  await pin.getByRole('button',{name:'Close',exact:true}).click();await pin.waitFor({state:'detached'});assert.equal(writes,0);assert.equal(await p.getByRole('alert').count(),0)
  await save.evaluate(el=>{el.click();el.click()});await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click()
  await p.getByRole('button',{name:'Accepted payments',exact:true}).waitFor();assert.equal(writes,1)
  assert.deepEqual(checkout.acceptance.routes.map(r=>r.network),['arbitrum','base'])
  await open();await p.getByRole('button',{name:'Stablecoins',exact:true}).click();await p.getByRole('heading',{name:'Stablecoins',exact:true}).waitFor();await p.getByRole('button',{name:'USDC',exact:true}).click();assert.equal(await p.getByRole('checkbox',{checked:true}).count(),1)
  await p.evaluate(()=>document.dispatchEvent(new Event('pocket:native-back',{bubbles:true,cancelable:true})));await p.getByRole('button',{name:'Back',exact:true}).click()
  await p.getByRole('heading',{name:'Accepted payments',exact:true}).waitFor()
  fail=true;await save.click();await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click();await p.getByRole('alert').waitFor();assert.equal(writes,2)
  const errorBox=await p.getByRole('alert').boundingBox(),saveBox=await save.boundingBox();assert(errorBox.y+errorBox.height<=saveBox.y)
  await p.getByRole('button',{name:'Receive fiat',exact:true}).click();await p.getByRole('heading',{name:'Receive fiat',exact:true}).waitFor();await p.getByLabel('Saved receiving account',{exact:true}).waitFor();await p.getByText('0123456789',{exact:true}).waitFor();assert.equal(setups,0);assert.equal(reads,1);await p.screenshot({path:'.codex-temp/xpay-saved-fiat-'+width+'-'+(dark?'dark':'light')+'.png'});await p.getByRole('button',{name:'Edit receiving account',exact:true}).click();await p.getByText('Receiving account setup',{exact:true}).waitFor();assert.equal(setups,1);await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByLabel('Saved receiving account',{exact:true}).waitFor();assert.equal(writes,2)
  fail=false;await p.getByRole('button',{name:'Edit receiving account',exact:true}).click();await p.getByRole('button',{name:'Receiving account setup',exact:true}).click();await pin.waitFor();await pin.getByRole('button',{name:'Close',exact:true}).click();await pin.waitFor({state:'detached'});assert.equal(writes,2);assert(checkout.destinations.some(d=>d.id==='fixture-bank'));await p.getByRole('button',{name:'Receiving account setup',exact:true}).click();await pin.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await pin.getByRole('button',{name:'Confirm',exact:true}).click();await p.getByLabel('Saved receiving account',{exact:true}).waitFor();await p.getByText('9876543210',{exact:true}).waitFor();assert.equal(writes,3);assert(!checkout.destinations.some(d=>d.id==='fixture-bank'));
  await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('heading',{name:'Accepted payments',exact:true}).waitFor()
  await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Done',exact:true}).click();await p.getByRole('button',{name:'Download QR',exact:true}).waitFor()
  checkout={...checkout,acceptance:undefined,destinations:checkout.destinations.filter(d=>d.kind==='bank')};await p.reload();await p.addScriptTag({content:bundle.outputFiles[0].text});await p.getByRole('button',{name:'Example restaurant',exact:true}).click();await p.getByRole('button',{name:'Payment options',exact:true}).click();await open();await p.getByRole('button',{name:'Stablecoins',exact:true}).click();await p.getByRole('heading',{name:'Stablecoins',exact:true}).waitFor();await p.getByRole('button',{name:'USDC',exact:true}).click();await p.getByRole('heading',{name:'USDC',exact:true}).waitFor();assert.equal(await p.getByRole('checkbox').count(),8);assert.equal(await p.getByRole('checkbox',{checked:true}).count(),0);assert.equal(await p.getByRole('checkbox',{disabled:true}).count(),2);assert(await p.getByRole('button',{name:'Continue',exact:true}).isDisabled());await p.screenshot({path:'.codex-temp/xpay-bank-only-networks-'+width+'-'+(dark?'dark':'light')+'.png'});await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('heading',{name:'Stablecoins',exact:true}).waitFor();for(const coin of ['USDT','USDe','USDG']){await p.getByRole('button',{name:coin,exact:true}).click();await p.getByRole('heading',{name:coin,exact:true}).waitFor();assert.equal(await p.getByRole('checkbox').count(),0);assert(await p.getByText('X Layer',{exact:true}).isVisible());if(coin==='USDT')assert(await p.getByText('BNB Chain',{exact:true}).isVisible());else assert.equal(await p.getByText('BNB Chain',{exact:true}).count(),0);await p.getByRole('button',{name:'Back',exact:true}).click()}await p.locator('img').evaluateAll(async images=>Promise.all(images.map(image=>image.decode())));await p.screenshot({path:'.codex-temp/xpay-coins-'+width+'-'+(dark?'dark':'light')+'.png'});await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('heading',{name:'Accepted payments',exact:true}).waitFor();assert.equal(writes,3);assert.deepEqual(errors,[]);await p.close()
 }
 console.log('PASS coin-first XPay: four coins, shared network catalogue, unconnected routes unavailable, preserved bank route, PIN cancellation/save, fixed CTA/errors, Back, fiat setup and QR return; 320/390 light/dark.')
}finally{await browser.close()}
