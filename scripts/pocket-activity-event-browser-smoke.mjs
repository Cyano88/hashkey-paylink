import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const empty={payments:[],merchants:[],collections:[],complete:true,partial:false,refreshing:false}
const bundle=await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import useActivity from './src/pocket/hooks/usePocketActivity';window.reads=[];function App(){const a=useActivity({authenticated:true,email:'new@fixture.invalid',enabled:true,recent:true,getAccessToken:async()=>'fixture'});window.refresh=a.refresh;return <pre id='state'>{JSON.stringify(a)}</pre>}window.mount=()=>createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixture',setup(b){b.onResolve({filter:/pocketReadClient$/},()=>({path:'read',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export async function readPocketActivity(input){window.reads.push({observe:input.observe,fresh:input.fresh});return {...window.next}}'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const p=await browser.newPage();await p.clock.install()
 await p.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid')
 await p.addScriptTag({content:bundle.outputFiles[0].text});await p.evaluate(v=>{window.next=v;window.mount()},empty)
 const state=()=>p.locator('#state').textContent().then(JSON.parse)
 await p.waitForFunction(()=>window.reads.length===1&&JSON.parse(document.getElementById('state').textContent).resolved)
 await p.clock.fastForward(60_000);assert.equal(await p.evaluate(()=>window.reads.length),1,'Ready-empty accounts do not poll while idle')
 await p.evaluate(async()=>{window.next={...window.next,complete:false,partial:true,refreshing:true};await window.refresh()})
 assert.equal((await state()).resolved,false);assert.equal((await state()).error,'','Initial loading is not an updating error message')
 await p.evaluate(v=>window.next=v,empty);await p.clock.runFor(2100)
 assert.equal(await p.evaluate(()=>window.reads.at(-1).observe),true,'Follow-up is read-only')
 assert.equal((await state()).resolved,true);assert.equal((await state()).rows.length,0)
 await p.evaluate(async()=>{window.next={...window.next,complete:false,partial:true,refreshing:true};await window.refresh()})
 const before=await p.evaluate(()=>window.reads.length)
 for(let i=0;i<6;i++)await p.clock.runFor(2100)
 assert.equal(await p.evaluate(()=>window.reads.length),before+5,'Pending source checks are bounded')
 assert.equal((await state()).busy,false);assert.match((await state()).error,/could not be updated/)
 await p.clock.fastForward(60_000);assert.equal(await p.evaluate(()=>window.reads.length),before+5)
 console.log('PASS real Chrome: ready-empty idle requests stop, initial loading stays quiet, completion reads cannot trigger scans, persistent pending state stops after five checks.')
}finally{await browser.close()}
