import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { mkdirSync, readFileSync, readdirSync } from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const entry=`import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import Sheet from './src/pocket/components/PocketTransactionSheet';
const receipt={type:'money_in',receiptId:'fixture',receiptHash:'fixture',eventId:'fixture',txHash:'0x'+'a'.repeat(64),chain:'xlayer',payer:'Fixture sender',recipient:'Fixture recipient',memo:'Asset received',amount:'0.01',asset:'NVDAx',createdAt:1750000000000,brandKind:'pocket',brandName:'Pocket',title:'Received'};
function App(){const[state,setState]=useState('pending');const[currentReceipt,setReceipt]=useState(receipt);window.setReceipt=setReceipt;window.show=setState;return state==='closed'?null:<Sheet key={state} title='Received' state={state} receipt={{...currentReceipt,status:state==='successful'?'confirmed':state==='pending'?'submitted':state}} amount='0.01 NVDAx' onDone={()=>setState('closed')}/>};createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:entry,loader:'jsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env.DEV':'false'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/PocketGetApp$|PocketReceiptReport$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export default ()=>null',loader:'jsx'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid');await page.addScriptTag({content:bundle.outputFiles[0].text});
 for(const file of readdirSync('dist/assets').filter(f=>f.endsWith('.css')))await page.addStyleTag({content:readFileSync('dist/assets/'+file,'utf8')});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--pocket-safe-top','0px');document.documentElement.style.setProperty('--pocket-safe-bottom','0px')});mkdirSync('output/playwright',{recursive:true});
 for(const [state,label] of [['pending','Processing'],['failed','Failed'],['successful','Successful']]){
  await page.evaluate(s=>window.show(s),state);const sheet=page.getByRole('dialog',{name:label,exact:true});await sheet.waitFor();assert.equal(await sheet.getByRole('button',{name:'Close',exact:true}).count(),0);
  await page.mouse.click(5,5);await page.keyboard.press('Escape');await page.evaluate(()=>window.dispatchEvent(new Event('pocket:native-back',{cancelable:true})));assert.equal(await sheet.count(),1);
  await sheet.getByRole('button',{name:'View receipt',exact:true}).click();const preview=page.getByRole('dialog',{name:'Receipt preview'});await preview.waitFor();await preview.getByText(label,{exact:true}).waitFor();await preview.getByText('NVDAx',{exact:false}).first().waitFor();
  await page.screenshot({path:'output/playwright/receipt-'+state+'.png'});await preview.getByRole('button',{name:'Done',exact:true}).click();await sheet.waitFor();await sheet.getByRole('button',{name:'Done',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0)
 }
 for(const source of ['bank-withdraw','bills'])for(const dark of [false,true]){
  await page.evaluate(({source,dark})=>{document.documentElement.classList.toggle('dark',dark);window.setReceipt({type:'money_out',receiptId:'fiat-fixture',receiptHash:'fixture',eventId:'fixture',txHash:'0x'+'a'.repeat(64),chain:'base',payer:'Fixture sender',recipient:'Fixture recipient',memo:'Fixture',amount:'0.736603',amountNgn:'1000',fiatCurrency:'NGN',asset:'USDC',createdAt:1750000000000,brandKind:'pocket',brandName:'Pocket',title:'Payment',source});window.show('successful')},{source,dark});
  const sheet=page.getByRole('dialog',{name:'Successful',exact:true});await sheet.waitFor();await sheet.getByText('NGN 1,000',{exact:true}).waitFor();const equivalent=sheet.getByText('0.736603 USDC',{exact:true});await equivalent.waitFor();assert(await equivalent.evaluate(e=>e.classList.contains('text-xs')));await sheet.getByRole('button',{name:'Done',exact:true}).click();
 }
 assert.deepEqual(errors,[]);console.log('PASS: all three states, asset details, receipt status, no X, backdrop/Escape/native-back protection, receipt return and Done')
}finally{await browser.close()}
