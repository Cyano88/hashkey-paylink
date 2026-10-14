import assert from 'node:assert/strict';
import fs from 'node:fs';
import {build} from 'esbuild';
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,Routes,Route}from'react-router-dom';import Services from './src/pocket/pages/PocketServicesPage';import Esim from './src/pocket/pages/PocketEsimPage';createRoot(document.getElementById('app')).render(<MemoryRouter initialEntries={['/pocket/services']}><Routes><Route path='/pocket/services' element={<Services/>}/><Route path='/pocket/services/esim' element={<Esim/>}/><Route path='/pocket/xpay' element={<h1>XPay existing route</h1>}/></Routes></MemoryRouter>)`;
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'import.meta.env':'{}'},plugins:[{name:'fixture',setup(b){b.onResolve({filter:/usePocketIdentity$|PocketKycPrompt$|usePocketWalletController$|usePocketWallets$|UnifiedReceipt$|pocketEvmTransferClient$|circleEvmEmailWallet$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.includes('Identity')?`export default()=>({ready:true,authenticated:true,email:'fixture@example.invalid',getAccessToken:async()=>'fixture-token'})`:'export const FullScreenReceiptSurface=()=>null; export const readCirclePaymentFeeQuote=async()=>({}); export const executePocketEvmTransfer=async()=>({}); export default()=>null',loader:'tsx'}))}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
const errors=[];
try{
 const p=await browser.newPage({viewport:{width:393,height:852}});p.setDefaultTimeout(7000);p.on('pageerror',e=>errors.push(e.message));
 let mode='coming_soon';await p.route('**/api/pocket/esim/price',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({purchaseEnabled:false,price:{subtotal:'5',platformFee:'0.0125',total:'5.0125',currency:'USD',days:7}})}));
 await p.route('**/api/pocket/esim/catalog',r=>mode==='error'?r.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'private provider failure'})}):r.fulfill({contentType:'application/json',body:JSON.stringify({status:mode,purchaseEnabled:false,destinations:mode==='available'?[{id:'nigeria',name:'Nigeria',countryCode:'NG',region:false,plans:[{id:'ng-1gb',title:'1 GB',data:'1 GB',days:7,operator:'Provider',topUp:true,fairUsage:'',activation:''}]},{id:'europe',name:'Europe',countryCode:'',region:true,plans:[{id:'eu-1gb',title:'1 GB',data:'1 GB',days:7,operator:'Provider',topUp:false,fairUsage:'',activation:''}]}]:[]})}));
 await p.route('**/brand/countries/*.svg',r=>r.fulfill({contentType:'image/svg+xml',body:fs.readFileSync('public'+new URL(r.request().url()).pathname)}));
 await p.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<div id="app"></div>'}));
 async function start(){await p.goto('https://fixture.invalid/');for(const f of fs.readdirSync('dist/assets').filter(f=>f.endsWith('.css')&&(f.startsWith('index-')||f.startsWith('CirclePocketApp-'))))await p.addStyleTag({content:fs.readFileSync('dist/assets/'+f,'utf8')});await p.addStyleTag({content:'html,body,#app{height:100%;margin:0}body{font-family:Inter,Arial,sans-serif;background:#F5F5F7}'});await p.addScriptTag({content:bundle.outputFiles[0].text});await p.getByRole('heading',{name:'Services',exact:true}).waitFor();}
 await start();assert.equal(await p.getByRole('button',{name:'Services',exact:true}).getAttribute('aria-current'),'page');
 await p.screenshot({path:'.codex-temp/pocket-services-mobile.png'});
 await p.getByRole('button',{name:/eSIM/}).click();await p.getByRole('heading',{name:'Stay connected abroad'}).waitFor();assert.equal(await p.getByRole('button',{name:/pay|buy/i}).count(),0);await p.screenshot({path:'.codex-temp/pocket-esim-mobile.png'});
 await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:/XPay/}).click();await p.getByRole('heading',{name:'XPay existing route'}).waitFor();
 mode='available';await start();await p.getByRole('button',{name:/eSIM/}).click();await p.getByRole('button',{name:'Nigeria'}).waitFor();assert.equal(await p.locator('img[src="/brand/countries/ng.svg"]').evaluate(i=>i.complete&&i.naturalWidth>0),true);await p.screenshot({path:'.codex-temp/pocket-esim-flags.png'});await p.getByRole('textbox',{name:'Search destinations'}).fill('Nigeria');await p.getByRole('button',{name:'Nigeria'}).click();await p.getByRole('button',{name:/1 GB 7 days/}).click();await p.getByRole('dialog',{name:'Plan details'}).waitFor();await p.getByText('5.01 USD',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Coming soon',exact:true}).isDisabled(),true);assert.equal(await p.getByRole('dialog').locator('text=net_price').count(),0);await p.screenshot({path:'.codex-temp/pocket-esim-details-mobile.png'});
 await p.getByRole('button',{name:'Close',exact:true}).click();await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('textbox',{name:'Search destinations'}).fill('');await p.getByRole('button',{name:'Regional',exact:true}).click();await p.getByRole('button',{name:'Europe',exact:true}).waitFor();
 mode='error';await start();await p.getByRole('button',{name:/eSIM/}).click();await p.getByText('Could not update eSIM plans. Please try again.',{exact:true}).waitFor();assert.equal((await p.locator('body').innerText()).includes('private provider failure'),false);mode='coming_soon';await p.getByRole('button',{name:'Try again',exact:true}).click();await p.getByRole('heading',{name:'Stay connected abroad'}).waitFor();
 let installationAttempts=0, installed=false;
 await p.route('**/api/pocket/esim/orders',async r=>{
   const body=r.request().postDataJSON();
   if(body?.action==='installation'){
     installationAttempts++;
     return r.fulfill({status:installationAttempts===1?503:200,contentType:'application/json',body:JSON.stringify(installationAttempts===1?{error:'Could not update your eSIM. Please try again.'}:{installation:{iccid:'fixture-iccid',activationCode:'LPA:1$example.invalid$fixture-code',apn:'plus',status:installed?'IN_USE':'NEW',smdpStatus:installed?'INSTALLATION':'RELEASED'}})});
   }
   return r.fulfill({contentType:'application/json',body:JSON.stringify({orders:[{id:'esim_fixture',state:'ready',packageCode:'ng-1gb',days:7,asset:'USDT',network:'base',price:{total:'5.0125'},createdAt:1,expiresAt:2,txHash:'',refundTxHash:''}]})});
 });
 await p.getByRole('button',{name:'My eSIMs',exact:true}).click();
 await p.getByRole('button',{name:/eSIM eSIM ready/}).click();
 await p.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.equal(await p.getByRole('button',{name:'Copy activation code'}).count(),0);
 await p.getByRole('button',{name:'Try again',exact:true}).click();
 await p.getByRole('button',{name:'Copy activation code',exact:true}).waitFor();
 await p.getByText('Manual installation',{exact:true}).click();
 await p.getByText('example.invalid',{exact:true}).waitFor();
 await p.screenshot({path:'.codex-temp/pocket-esim-installation-mobile.png'});
 assert.equal(installationAttempts,2);
 await p.evaluate(()=>Object.defineProperty(navigator,'userAgent',{configurable:true,value:'Mozilla/5.0 (Linux; Android 16; Pixel)'}));
 await p.getByRole('button',{name:'Close',exact:true}).click();
 await p.getByRole('button',{name:/eSIM eSIM ready/}).click();
 await p.getByRole('button',{name:'Install eSIM',exact:true}).waitFor();
 await p.getByText('Internet setup',{exact:true}).click();
 await p.getByText('plus',{exact:true}).waitFor();
 assert.equal(await p.getByRole('button',{name:'Copy activation code',exact:true}).isVisible(),false);
 installed=true;
 await p.getByRole('button',{name:'Close',exact:true}).click();
 await p.getByRole('button',{name:/eSIM eSIM ready/}).click();
 await p.getByText('eSIM installed',{exact:true}).waitFor();
 assert.equal(await p.getByRole('button',{name:'Install eSIM',exact:true}).count(),0);
 await p.getByText('plus',{exact:true}).waitFor();
 await p.screenshot({path:'.codex-temp/pocket-esim-setup-mobile.png'});
 await p.setViewportSize({width:1280,height:900});await p.screenshot({path:'.codex-temp/pocket-esim-desktop.png'});assert.deepEqual(errors,[]);console.log('PASS eSIM catalog, search, regions, purchase gate, mobile/desktop sheets and installation failure/retry/manual details.');
}finally{await browser.close()}
