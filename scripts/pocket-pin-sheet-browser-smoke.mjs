import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile,mkdir} from 'node:fs/promises';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const stubs={
'usePocketIdentity':`export default ()=>({logout:async()=>{window.loggedOut=true}});`,
'pocketPaymentSecurityClient':`export const readPocketPaymentSecurity=async()=>({configured:true,pinLength:4});export const updatePocketPaymentSecurity=async()=>({});export const beginPocketPaymentPinReset=async()=>({resetToken:'fixture-reset'});export const verifyPocketPaymentPin=async(_,pin)=>{window.verified.push(pin);if(pin!=='1234')throw Error('Incorrect PIN');return {approvalToken:'fixture',expiresAt:Date.now()+60000,authorization:'fixture'}};`,
'pocketPaymentBiometrics':`export const pocketPaymentBiometricsAvailable=async()=>true;export const pocketPaymentBiometricsConfigured=()=>true;export const pocketPaymentBiometricsEnabled=()=>true;export const disablePocketPaymentBiometrics=async()=>{};export const enablePocketPaymentBiometrics=async()=>{};export const readPocketPinWithBiometrics=()=>new Promise((resolve,reject)=>{window.bioResolve=resolve;window.bioCancel=()=>reject(Error('Cancelled'))});`,
'usePocketSessionSplash':`export const resetPocketSessionSplash=()=>{};`,
'pocketPushPreference':`export const unregisterPocketPushDevice=async()=>{};`,
'pocketQuickApproval':`export const disablePocketQuickApproval=async()=>{};`,
'pocketSecureWalletSession':`export const deletePocketSecureWalletSession=async()=>{};`,
'pocketAccountState':`export const clearPocketAccountOperationState=()=>{};`
};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Gate from './src/pocket/components/PocketPaymentSecurityGate';import {requestPocketPaymentApproval} from './src/pocket/lib/pocketPaymentApproval';window.verified=[];window.ask=()=>{window.approval='waiting';requestPocketPaymentApproval().then(()=>window.approval='approved',()=>window.approval='cancelled')};const token=async()=> 'fixture';createRoot(document.getElementById('app')).render(<MemoryRouter><Gate email="test@example.invalid" getAccessToken={token}><button onClick={()=>window.ask()}>Test approval</button></Gate></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},plugins:[{name:'isolated-security',setup(b){b.onResolve({filter:/.*/},args=>{const key=args.path.split('/').pop();if(stubs[key])return {path:key,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',error=>console.error(error.message));
try{
 await page.route('https://pocket.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));await page.goto('https://pocket.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByRole('button',{name:'Test approval'}).click();await page.waitForFunction(()=>!!window.bioCancel);assert.equal(await page.getByRole('dialog').count(),0,'PIN hidden while biometric open');
 await page.evaluate(()=>window.bioCancel());await page.getByRole('textbox',{name:'4-digit Pocket PIN'}).waitFor();
 if(process.argv.includes('--visual')){const html=await readFile('dist/index.html','utf8');const css=html.match(/href="([^"]+\.css)"/)[1];await page.addStyleTag({content:await readFile('dist/'+css.replace(/^\//,''),'utf8')});await mkdir('.codex-temp',{recursive:true});await page.screenshot({path:'.codex-temp/pin-sheet-light.png'});await page.evaluate(()=>document.documentElement.classList.add('dark'));await page.screenshot({path:'.codex-temp/pin-sheet-dark.png'});await page.evaluate(()=>document.documentElement.classList.remove('dark'));}
 const slots=page.locator('[aria-hidden="true"] > span');assert.equal(await slots.count(),4);
 assert.ok(await page.getByRole('button',{name:'Forgot PIN?'}).evaluate(node=>Boolean(node.compareDocumentPosition([...document.querySelectorAll('button')].find(b=>b.textContent==='Use biometric')) & Node.DOCUMENT_POSITION_FOLLOWING)));
 await page.locator('[data-pocket-sheet]').locator('..').evaluate(node=>node.click());assert.equal(await page.getByRole('dialog').count(),1,'Backdrop cannot dismiss');
 await page.getByRole('button',{name:'Use biometric'}).click();assert.equal(await page.getByRole('dialog').count(),0);await page.evaluate(()=>window.bioCancel());
 await page.getByRole('textbox',{name:'4-digit Pocket PIN'}).fill('1234');await page.getByRole('button',{name:'Confirm',exact:true}).click();await page.waitForFunction(()=>window.approval==='approved');assert.deepEqual(await page.evaluate(()=>window.verified),['1234']);
 await page.getByRole('button',{name:'Test approval'}).click();await page.evaluate(()=>window.bioCancel());await page.getByRole('button',{name:'Forgot PIN?'}).click();await page.waitForFunction(()=>window.loggedOut===true);assert.equal(await page.evaluate(()=>localStorage.getItem('pocket:payment-pin:reset-after-login:v1')),'fixture-reset');
 console.log('PASS biometric-first, cancellation fallback, 4 compact PIN slots, ordered reset/biometric actions, backdrop guard, PIN approval and fresh-login reset. No real credentials.');
}finally{await browser.close()}
