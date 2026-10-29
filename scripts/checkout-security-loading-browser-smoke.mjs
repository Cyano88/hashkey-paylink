import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 usePocketIdentity:`const token=async()=>null;export default()=>({authenticated:true,ready:true,user:{id:'fixture'},email:'fixture@example.com',getAccessToken:token,logout:async()=>{window.logouts++}})`,
 usePocketStockWallet:`export default()=>({})`,
 PrivyLoginProvider:`export const usePrivyLoginLauncher=()=>null`,
 PocketEmailLogin:`export default()=>null`,
 PocketXPay:`export default()=> <h1>Review payment</h1>`,
 pocketRoutes:`export const pocketApiUrl=p=>p,POCKET_BASE_PATH='',POCKET_ROUTES={root:'/'},isPocketNativeRuntime=()=>false`,
 pocketPaymentSecurityClient:`export const checkPocketPaymentPinReset=async()=>({eligible:window.resetEligible===true,error:'Verify email again'});export const readPocketPaymentSecurity=()=>new Promise(resolve=>window.resolveSecurity=resolve);export const verifyPocketPaymentPin=async()=>{window.verifications++;throw Error('Incorrect PIN')};export const updatePocketPaymentSecurity=async()=>{if(window.resetEligible)throw Object.assign(Error('Reset expired'),{code:'PIN_RESET_REAUTH_REQUIRED'});throw Error('Unexpected setup')},beginPocketPaymentPinReset=async()=>({resetToken:'fixture-reset-token',expiresAt:Date.now()+900000})`,
 pocketPaymentApproval:`export const POCKET_PAYMENT_APPROVAL_EVENT='test:approval',POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='test:cancelled',setPocketPaymentApproval=()=>{window.authorizations++}`,
 pocketPaymentBiometrics:`export const pocketPaymentBiometricsAvailable=async()=>false,pocketPaymentBiometricsConfigured=()=>false,pocketPaymentBiometricsEnabled=()=>false,disablePocketPaymentBiometrics=async()=>{},enablePocketPaymentBiometrics=async()=>{},readPocketPinWithBiometrics=async()=>null`,
 usePocketSessionSplash:`export const resetPocketSessionSplash=()=>{}`,
 pocketPushPreference:`export const unregisterPocketPushDevice=async()=>{}`,
 pocketQuickApproval:`export const disablePocketQuickApproval=async()=>{}`,
 pocketSecureWalletSession:`export const deletePocketSecureWalletSession=async()=>{}`,
 pocketAccountState:`export const clearPocketAccountOperationState=()=>{}`,
}
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation}from'react-router-dom';import Page from'./src/pocket/pages/PocketXPayCheckoutPage';import Gate from'./src/pocket/components/PocketPaymentSecurityGate';function Route(){window.currentRoute=useLocation().pathname+useLocation().search;return null}const token=async()=>null;createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/pay/c/chkx_'+ 'a'.repeat(24)+'?browser=1']}><Route/>{window.native?<Gate email="fixture@example.com" getAccessToken={token}><h1>Review payment</h1></Gate>:<Page merchantOverride={'chkx_'+'a'.repeat(24)}/>}</MemoryRouter>);`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'fixture'}});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 for(const native of [false,true])for(const configured of [false,true])for(const staleReset of [false,...(configured?[true,'fresh']:[])]){
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://checkout.test/**',r=>r.fulfill({contentType:r.request().url().includes('/api/')?'application/json':'text/html',body:r.request().url().includes('/api/')?JSON.stringify({ok:true,merchant:{name:'Lunchroom',fixedAmount:'1.5',expiresAt:Date.now()+900000}}):'<style>'+css+'</style><div id="root"></div>'}))
  await page.goto('https://checkout.test/');await page.evaluate(native=>{window.native=native;window.authorizations=0;window.verifications=0;window.logouts=0;window.flash=false;new MutationObserver(()=>{if(document.body.textContent.includes('Pocket security'))window.flash=true}).observe(document.body,{subtree:true,childList:true})},native)
  if(staleReset)await page.evaluate(fresh=>{window.resetEligible=fresh;localStorage.setItem('pocket:payment-pin:reset-after-login:v1','old-reset')},staleReset==='fresh')
  await page.addScriptTag({content:bundle.outputFiles[0].text});await page.waitForFunction(()=>typeof window.resolveSecurity==='function')
  assert.equal(await page.getByRole('heading',{name:'Review payment'}).count(),0,'Security must resolve before exposing payment')
  if(native)await page.getByRole('dialog',{name:'Pocket security',exact:true}).waitFor()
  else {await page.getByRole('status',{name:'Opening checkout'}).waitFor();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByLabel('Hash PayLink',{exact:true}).count(),1);assert.equal(await page.evaluate(()=>window.flash),false)}
  await page.evaluate(configured=>window.resolveSecurity({configured,pinLength:4}),configured)
  if(staleReset==='fresh'){
   await page.getByRole('heading',{name:'Reset Pocket PIN',exact:true}).waitFor()
   await page.getByLabel('New Pocket PIN').fill('1234');await page.getByLabel('Confirm Pocket PIN').fill('1234')
   await page.getByRole('button',{name:'Continue',exact:true}).click()
   await page.getByRole('heading',{name:'Verify email to reset your PIN',exact:true}).waitFor()
   assert.equal(await page.getByLabel('New Pocket PIN').count(),0)
  }else if(staleReset){
   await page.getByRole('heading',{name:'Verify email to reset your PIN',exact:true}).waitFor()
   assert.equal(await page.getByRole('heading',{name:'Reset Pocket PIN',exact:true}).count(),0)
   assert.equal(await page.getByLabel('New Pocket PIN').count(),0)
   await page.getByRole('button',{name:'Send a new email code',exact:true}).click();await page.waitForFunction(()=>window.logouts===1)
   await page.waitForFunction(expected=>window.currentRoute===expected,native?'/':'/pay/c/chkx_'+'a'.repeat(24)+'?browser=1')
  }else if(!configured){await page.getByRole('heading',{name:'Create your Pocket PIN'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Review payment'}).count(),0)}
  else{
   await page.getByRole('heading',{name:'Review payment'}).waitFor();if(!native)assert.equal(await page.evaluate(()=>window.flash),false)
   await page.evaluate(()=>{window.dispatchEvent(new CustomEvent('test:approval',{detail:{resolve:()=>{window.authorizations++},reject:()=>{window.cancelled=true}}}))})
   await page.getByRole('dialog',{name:'Enter Pocket PIN'}).waitFor();await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.evaluate(()=>window.cancelled),true)
   await page.evaluate(()=>window.dispatchEvent(new CustomEvent('test:approval',{detail:{resolve:()=>{window.authorizations++},reject:()=>{window.cancelled=true}}})))
   await page.getByRole('button',{name:'Forgot PIN?',exact:true}).click();await page.waitForFunction(()=>window.logouts===1)
   await page.waitForFunction(expected=>window.currentRoute===expected,native?'/':'/pay/c/chkx_'+'a'.repeat(24)+'?browser=1')
   assert.equal(await page.evaluate(()=>localStorage.getItem('pocket:payment-pin:reset-after-login:v1')),'fixture-reset-token')
  }
  assert.equal(await page.evaluate(()=>window.authorizations),0);assert.equal(await page.evaluate(()=>window.verifications),0);assert.deepEqual(errors,[]);await page.close()
 }
 console.log('PASS real security gate: hosted loading never flashes Pocket modal; native loading unchanged; unconfigured users gated; explicit PIN approval and cancellation preserved.')
}finally{await browser.close()}
