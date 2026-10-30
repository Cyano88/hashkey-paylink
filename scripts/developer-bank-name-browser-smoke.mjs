import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync} from 'node:fs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Bank from './src/developer/BankAccountName';window.calls=[];window.fetch=async(_url,options)=>new Promise(resolve=>window.calls.push({body:JSON.parse(options.body),resolve}));function App(){const[p,set]=React.useState({projectId:'fixture',bankCode:'OPAYNGPC',accountNumber:'',savedName:'SAVED NAME'});window.change=patch=>set(old=>({...old,...patch}));return <Bank {...p}/>};createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'privy',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const usePrivy=()=>({user:{id:'fixture-owner'},getAccessToken:async()=>'fixture-token'})`}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage();await page.setContent('<div id="root"></div>');await page.addStyleTag({content:readFileSync('output/playwright/developer-preview/styles.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text})
 const name=page.getByRole('textbox',{name:'Account name',exact:true});await name.waitFor();assert.equal(await name.inputValue(),'SAVED NAME');assert.equal(await name.getAttribute('readonly'),'')
 await page.evaluate(()=>window.change({accountNumber:'0123'}));assert.equal(await name.inputValue(),'');await page.waitForTimeout(500);assert.equal(await page.evaluate(()=>window.calls.length),0)
 await page.evaluate(()=>window.change({accountNumber:'0123456789'}));await page.getByRole('status',{name:'Verifying bank account'}).waitFor();await page.waitForFunction(()=>window.calls.length===1)
 await page.evaluate(()=>window.change({bankCode:'OTHERBANK'}));await page.waitForFunction(()=>window.calls.length===2)
 await page.evaluate(()=>window.calls[0].resolve(Response.json({ok:true,accountName:'STALE NAME'})));assert.equal(await page.getByRole('status',{name:'Verifying bank account'}).count(),1)
 await page.evaluate(()=>window.calls[1].resolve(Response.json({ok:true,accountName:'CURRENT NAME'})));await page.waitForFunction(()=>document.querySelector('input')?.value==='CURRENT NAME')
 await page.evaluate(()=>window.change({accountNumber:'0987654321'}));assert.equal(await page.getByRole('status',{name:'Verifying bank account'}).count(),1);await page.waitForFunction(()=>window.calls.length===3)
 await page.evaluate(()=>window.calls[2].resolve(Response.json({ok:false,error:'Bank unavailable'},{status:503})));await page.getByRole('alert').filter({hasText:'Bank unavailable'}).waitFor();assert.equal(await name.inputValue(),'')
 await page.getByRole('button',{name:'Try again'}).click();await page.waitForFunction(()=>window.calls.length===4);await page.evaluate(()=>window.calls[3].resolve(Response.json({ok:true,accountName:'RETRIED NAME'})));await page.waitForFunction(()=>document.querySelector('input')?.value==='RETRIED NAME')
 assert.ok(await page.evaluate(()=>window.calls.every(c=>c.body.action==='verify-bank-account')))
 console.log('PASS automatic bank-name lookup: incomplete input skips lookup; read-only name; shimmer; stale response ignored; bank/number changes invalidate; failure and retry; no save calls.')
}finally{await browser.close()}
