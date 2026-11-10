import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync,existsSync,writeFileSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
let source=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {FullScreenReceiptSurface} from './src/components/UnifiedReceipt';import {pocketActivityReceipt} from './src/pocket/lib/pocketReceipt';import {createPaymentReceiptImage,createPaymentReceiptPdf} from './src/lib/paymentReceiptPdf';const row={eventId:'marketplace-refund-fixture',txHash:'0x'+'a'.repeat(64),chain:'base',payer:'0x'+'1'.repeat(40),recipient:'0x'+'2'.repeat(40),destination:'0x'+'2'.repeat(40),memo:'Marketplace refund',source:'marketplace-refund',contextLabel:'Hash PayLink Marketplace Test - Refund',merchantName:'Hash PayLink Marketplace Test',direction:'in',settlementType:'wallet_transfer',paycrestStatus:'confirmed',amount:'0.03',assetSymbol:'USDC',feeAmount:'0',ts:1794273345878};const receipt=pocketActivityReceipt(row);window.exportReceipt=async()=>({image:await createPaymentReceiptImage(receipt),pdf:Array.from(new Uint8Array(await (await createPaymentReceiptPdf(receipt)).arrayBuffer()))});function App(){const [open,setOpen]=useState(true);return <><button onClick={()=>setOpen(true)}>Open receipt</button>{open&&<FullScreenReceiptSurface receipt={receipt} surface='receipt' onClose={()=>setOpen(false)}/>}</>}createRoot(document.getElementById('root')).render(<App/>);`
const payout=process.argv.includes('--payout'),kind=payout?'payout':'refund'
if(payout)source=source.replaceAll('marketplace-refund','marketplace-payout').replaceAll('Marketplace refund','Marketplace payout').replaceAll(' - Refund',' - Payout').replace("amount:'0.03'","amount:'0.016403'").replace("feeAmount:'0'","feeAmount:'0.003597'")
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'}})
const out='output/playwright/marketplace-receipt';mkdirSync(out,{recursive:true})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [320,426]){
 const p=await browser.newPage({viewport:{width,height:952}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
 await p.route('https://receipt.fixture/**',r=>{const file='public'+new URL(r.request().url()).pathname;return existsSync(file)&&!file.endsWith('/')?r.fulfill({path:file}):r.fulfill({contentType:'text/html',body:'<div id="root"></div>'})})
 await p.goto('https://receipt.fixture');await p.addStyleTag({content:await checkoutTestCss()});await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.getByText('Hash PayLink Marketplace Test',{exact:true}).waitFor()
 assert.equal(await p.getByText('Destination',{exact:true}).count(),0);assert.equal(await p.getByText('Narration',{exact:true}).count(),0)
 assert.equal(await p.getByText('0x'+'2'.repeat(40),{exact:true}).count(),1)
 assert.equal(await p.getByText(payout?'0.016403 USDC':'0.03 USDC',{exact:true}).count(),1)
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
 await p.screenshot({path:out+'/'+kind+'-'+width+'.png',fullPage:true})
 await p.getByRole('button',{name:'Back',exact:true}).click();assert.equal(await p.getByText('Hash PayLink Marketplace Test',{exact:true}).count(),0)
 await p.getByRole('button',{name:'Open receipt',exact:true}).click();await p.getByText('Hash PayLink Marketplace Test',{exact:true}).waitFor()
 if(width===426){const data=await p.evaluate(()=>window.exportReceipt());assert.ok(data.image.startsWith('data:image/'));writeFileSync(out+'/'+kind+'-export.jpg',Buffer.from(data.image.split(',')[1],'base64'));writeFileSync(out+'/'+kind+'-export.pdf',Buffer.from(data.pdf));assert.ok(data.pdf.length>1000)}
 assert.deepEqual(errors,[]);await p.close()
}}finally{await browser.close()}
console.log('PASS actual receipt screen at 320/426 widths, marketplace name, one recipient, no destination/narration, back/reopen and image/PDF export. Fixtures; no emails or money moved.')
