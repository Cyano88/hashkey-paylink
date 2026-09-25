import assert from 'node:assert/strict';
import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const stubs={
'usePocketIdentity':`export default ()=>({getAccessToken:async()=>''});`,
'pocketStockNotificationsClient':`export const stockNotificationsRequest=async()=>({});`,
'pocketStockPickerTokens':`export const stockPickerTokens=()=>[{address:'0x1',symbol:'USDC',balance:2}];`,
'PocketArcTokenPicker':`export default ()=>null;`,
'pocketReceipt':`export const pocketActivityReceipt=()=>null;`,
'PocketTransactionSheet':`import React from 'react';export default ({state,onDone})=><div role="dialog" aria-label="Transaction status">{state}<button onClick={onDone}>Done</button></div>;`,
'pocketXStocksWallet':`export const stockUsdc={address:'0x1',symbol:'USDC'};export const stockGasAsset={address:'native',symbol:'OKB'};export const stockAssets=[];export const stockQuantity=()=> '0.00001';export const prepareStockTransfer=async(owner,asset,recipient,amount)=>({owner,asset,recipient,amount,fee:1n,expiresAt:Date.now()+60000});`
};
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Send from './src/pocket/components/PocketStockWalletActions';window.calls=0;window.release=null;const wallet={address:'0x123',ready:true,busy:false,uncertain:false,balanceStale:false,snapshot:{},pending:{hash:'0xold',status:'confirmed'},send:async(review,hooks)=>{window.calls++;await new Promise(resolve=>window.release=resolve);await hooks.beforeSubmit?.();hooks.onSubmitted('0xnew');return '0xnew'},refresh:async()=>{},connect:()=>{}};createRoot(document.getElementById('app')).render(<MemoryRouter><Send wallet={wallet} view="send"/></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},plugins:[{name:'isolated-wallet',setup(b){b.onResolve({filter:/.*/},args=>{const key=args.path.split('/').pop();if(stubs[key])return {path:key,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},args=>({contents:stubs[args.path],loader:'tsx',resolveDir:process.cwd()}));}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});const page=await browser.newPage();page.on('pageerror',error=>console.error(error.message));
try{
 await page.route('https://pocket.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));await page.goto('https://pocket.test/');await page.addScriptTag({content:bundle.outputFiles[0].text});
 await page.getByText('Send on X Layer').waitFor();assert.equal(await page.getByText('Transfer confirmed').count(),0);
 await page.getByRole('textbox').nth(0).fill('0xrecipient');await page.getByRole('textbox').nth(1).fill('1');await page.getByRole('button',{name:'Review send',exact:true}).click();
 await page.getByRole('button',{name:'Confirm send',exact:true}).click();await page.waitForFunction(()=>window.calls===1);
 assert.equal(await page.getByRole('dialog',{name:'Transaction status'}).count(),0,'Approval must not open Processing');
 assert.equal(await page.getByRole('button',{name:'Confirm send',exact:true}).isDisabled(),true);
 await page.evaluate(()=>window.release());await page.getByRole('dialog',{name:'Transaction status'}).waitFor();assert.equal(await page.evaluate(()=>window.calls),1);
 console.log('PASS: shared stock Send review, duplicate lock, no premature Processing during approval, result after the wallet confirmation operation, no historical success banner. No wallet or network calls.');
}finally{await browser.close()}
