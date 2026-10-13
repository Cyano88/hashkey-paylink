import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Sheet from './src/pocket/components/PocketBridgeProgressSheet';import{savePocketBridgeTransfer,readPocketBridgeTransfers}from'./src/pocket/lib/pocketPendingBridge';import{trackPocketOperation,readPocketOperations}from'./src/pocket/lib/pocketOperationRecovery';
window.usdc=(progress)=>savePocketBridgeTransfer('owner',{id:'usdc',source:'arbitrum',destination:'base',amount:'2',createdAt:1,progress,sourceConfirmed:progress==='arriving'},localStorage);
window.usdt=(state,id='usdt')=>trackPocketOperation('owner','bridge',{quoteToken:'sealed',quote:{id,source:'arbitrum',destination:'base',amount:'3'}},state);
window.records=()=>[readPocketBridgeTransfers('owner',localStorage).length,readPocketOperations('owner').length];
function App(){const[active,setActive]=useState(null);window.openBridge=(asset,id)=>setActive({owner:'owner',asset,id});return <>{active&&<Sheet active={active} onDone={()=>setActive(null)}/>}</>};createRoot(document.getElementById('root')).render(<App/>);`
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',plugins:[{name:'sheet-surface',setup(b){b.onResolve({filter:/PocketTransactionSheet$/},()=>({path:'sheet',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`import React from'react';export default p=><section role="dialog" data-state={p.state}><h1>{p.statusLabel}</h1><p>{p.amount}</p><p>{p.detail}</p><button onClick={p.onDone}>Done</button></section>`,loader:'tsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.test');await page.addScriptTag({content:result.outputFiles[0].text});await page.waitForFunction(()=>!!window.openBridge)
 await page.evaluate(()=>window.usdc('submitted'));assert.equal(await page.getByRole('dialog').count(),0,'Saved history must not open a sheet')
 await page.evaluate(()=>window.openBridge('USDC','usdc'));await page.getByRole('heading',{name:'Bridging',exact:true}).waitFor()
 await page.evaluate(()=>window.usdc('arriving'));await page.getByRole('heading',{name:'Arriving',exact:true}).waitFor();assert.equal(await page.getByRole('dialog').getAttribute('data-state'),'pending','A source debit does not prove destination delivery')
 await page.evaluate(()=>window.usdc('completed'));await page.getByRole('heading',{name:'Bridge successful'}).waitFor();await page.getByRole('button',{name:'Done'}).click();assert.deepEqual(await page.evaluate(()=>window.records()),[1,0])
 await page.evaluate(()=>{window.usdt('processing');window.openBridge('USDT','usdt')});await page.getByRole('heading',{name:'Bridging',exact:true}).waitFor();await page.evaluate(()=>window.usdt('failed'));await page.getByRole('heading',{name:'Bridge failed'}).waitFor();await page.getByRole('button',{name:'Done'}).click()
 await page.evaluate(()=>{window.usdt('processing','closed');window.openBridge('USDT','closed')});await page.getByRole('heading',{name:'Bridging',exact:true}).waitFor();await page.getByRole('button',{name:'Done'}).click();await page.evaluate(()=>window.usdt('completed','closed'));assert.equal(await page.getByRole('dialog').count(),0,'Background completion must not reopen a dismissed sheet')
 await page.reload();await page.addScriptTag({content:result.outputFiles[0].text});await page.waitForFunction(()=>!!window.openBridge);assert.equal(await page.getByRole('dialog').count(),0);assert.deepEqual(await page.evaluate(()=>window.records()),[1,2],'Reload keeps Activity records without reopening old progress')
 console.log('PASS bridge sheet: live progress, success/failure, dismissal durability and no old recovery popup after reload')
}finally{await browser.close()}
