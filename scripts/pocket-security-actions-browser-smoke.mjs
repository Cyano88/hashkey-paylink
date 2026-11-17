import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const source=fs.readFileSync('src/pocket/components/PocketProfileFeaturePage.tsx','utf8');
const panel=source.slice(source.indexOf('function SecurityPanel('),source.indexOf('\nexport default function'));
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`import{installInputModality}from'./src/lib/inputModality';installInputModality();import React,{useState,useEffect,useRef} from 'react';import{createRoot}from'react-dom/client';import{Loader2}from'./src/pocket/components/PocketIcons';import{cn}from'./src/lib/utils';const pocketPaymentBiometricsEnabled=()=>false,pocketPaymentBiometricsAvailable=async()=>true;window.calls=[];const wait=action=>{window.calls.push(action);return new Promise((resolve,reject)=>{window.finish=resolve;window.fail=()=>reject(Error('Try again.'))})};const updatePocketPaymentSecurity=()=>wait('pin'),verifyPocketPaymentPin=()=>wait('biometrics'),enablePocketPaymentBiometrics=async()=>{},disablePocketPaymentBiometrics=async()=>{},reconnectPocketBaseWallet=()=>wait('reconnect');${panel};createRoot(document.getElementById('root')).render(<SecurityPanel email='fixture@example.com' stocks={false} getAccessToken={async()=>null} onResetPin={()=>wait('reset')}/>);`},bundle:true,write:false,jsx:'automatic'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.setContent('<div id="root"></div>');await page.addStyleTag({content:fs.readFileSync('src/focus.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});
 const focusField=page.getByLabel('New Pocket PIN',{exact:true});await focusField.click();assert(await focusField.evaluate(e=>getComputedStyle(e).outlineStyle==='none'),'Pointer focus has no ring');await page.keyboard.press('Tab');assert(await page.getByLabel('Confirm new Pocket PIN',{exact:true}).evaluate(e=>getComputedStyle(e).outlineStyle==='solid'),'Tab restores keyboard focus ring');await focusField.click();assert(await focusField.evaluate(e=>getComputedStyle(e).outlineStyle==='none'),'Pointer use clears keyboard focus treatment');
 await page.getByLabel('Current PIN',{exact:true}).fill('1234');
 for(const [name,value] of [['Current Pocket PIN','1234'],['New Pocket PIN','5678'],['Confirm new Pocket PIN','5678']])await page.getByLabel(name,{exact:true}).fill(value);
 for(const [action,trigger,pending] of [['pin','Change PIN','Changing PIN'],['reconnect','Reconnect Circle wallet','Reconnecting'],['reset','Forgot or reset PIN','Starting reset']]){
  await page.getByRole('button',{name:trigger,exact:true}).click();
  const busy=page.getByRole('button',{name:pending,exact:true});await busy.waitFor();assert.equal(await busy.getAttribute('aria-busy'),'true');assert.equal(await busy.locator('span.animate-spin').count(),1);
  for(const other of ['Change PIN','Reconnect Circle wallet','Forgot or reset PIN'].filter(n=>n!==trigger))assert(await page.getByRole('button',{name:other,exact:true}).isDisabled());
  assert(await page.getByLabel('Current Pocket PIN',{exact:true}).isDisabled());
  await page.evaluate(()=>window.fail());await page.getByRole('alert').getByText('Try again.').waitFor();assert(await page.getByRole('button',{name:trigger,exact:true}).isEnabled());
 }
 await page.getByRole('switch',{name:'Fingerprint or face'}).click();await page.getByRole('status').getByText('Updating',{exact:true}).waitFor();assert.equal(await page.getByRole('switch').getAttribute('aria-busy'),'true');
 assert.equal(await page.getByRole('button',{name:'Reconnect Circle wallet',exact:true}).count(),1);await page.evaluate(()=>window.fail());await page.getByRole('alert').waitFor();
 assert.deepEqual(await page.evaluate(()=>window.calls),['pin','reconnect','reset','biometrics']);
 await page.getByRole('button',{name:'Reconnect Circle wallet',exact:true}).click();await page.evaluate(()=>window.finish());await page.getByRole('status').getByText('Circle wallet session reconnected on this phone.',{exact:true}).waitFor();assert(await page.getByRole('button',{name:'Reconnect Circle wallet',exact:true}).isEnabled());
 assert((await page.getByLabel('New Pocket PIN',{exact:true}).getAttribute('class')).includes('placeholder:tracking-normal'));
 console.log('PASS security actions: associated biometric PIN label, action-specific spinners, other controls locked, failure/retry restored, no unrelated action relabelled; synthetic requests only.');
}finally{await browser.close()}
