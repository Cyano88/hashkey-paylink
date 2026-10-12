import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs';
const result=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Shell from './src/pocket/components/PocketRouteShell';createRoot(document.getElementById('root')).render(<MemoryRouter><Shell springBackPage active="home" onSelect={()=>{}}><section data-pocket-balance-card style={{height:272}}>Balance</section><section style={{height:70}}>Actions</section><section data-activity style={{height:400}}>Recent activity</section></Shell></MemoryRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'}});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const p=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
 await p.route('https://fixture.invalid/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://fixture.invalid');await p.addScriptTag({content:result.outputFiles[0].text});
 await p.addStyleTag({content:'*{box-sizing:border-box}body{margin:0}[data-pocket-scroller]{position:absolute;top:0!important;bottom:0;width:390px}[data-pocket-page-content]{padding:16px 16px 120px;transition:transform 420ms cubic-bezier(.22,1.35,.36,1)}[data-pocket-page-content][data-dragging]{transition:none}[data-pocket-refresh-indicator]{position:absolute}'});
 const cdp=await p.context().newCDPSession(p);
 const state=()=>p.evaluate(()=>({card:document.querySelector('[data-pocket-balance-card]').getBoundingClientRect().top,activity:document.querySelector('[data-activity]').getBoundingClientRect().top,scroll:document.querySelector('[data-pocket-scroller]').scrollTop,ring:document.querySelector('[data-pocket-refresh-indicator]').getAttribute('aria-hidden')}));
 const initial=await state();
 for(const [from,to] of [[250,120],[580,400],[200,245]]){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:180,y:from}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:180,y:to}]});await p.waitForTimeout(60);
  const moved=await state();assert.ok(Math.abs(moved.card-initial.card)>1);assert.ok(Math.abs((moved.card-initial.card)-(moved.activity-initial.activity))<0.1,'card and activity move together');assert.equal(moved.ring,'true');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(550);
  const settled=await state();assert.ok(Math.abs(settled.card-initial.card)<0.1,'full card returns to launch position');assert.equal(settled.scroll,0);
 }
 assert.equal(await p.locator('[data-pocket-independent-scroll]').count(),0);
 console.log('PASS real touch swipes on card and activity move together, return to launch position, and keep short-pull refresh hidden.');
}finally{await browser.close()}
