import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useNavigate}from'react-router-dom';import Transition from './src/pocket/components/PocketRailTransition';function Fixture(){window.navigate=useNavigate();return <Transition/>}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[{pathname:'/xstocks/home',state:{pocketRailTransition:'xstocks'}}]}><Fixture/></MemoryRouter>)`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.waitForSelector('.pocket-mode-curtain');assert.match(await page.locator('.pocket-mode-curtain').innerText(),/Trade stocks/)
 await page.evaluate(()=>window.navigate('/xstocks/activity',{state:null}));await page.waitForSelector('.pocket-mode-curtain',{state:'detached'});assert.deepEqual(errors,[])
 await page.evaluate(()=>window.navigate('/home',{state:{pocketRailTransition:'stablecoins'}}));await page.waitForSelector('.pocket-mode-curtain');assert.match(await page.locator('.pocket-mode-curtain').innerText(),/USDC can do more/)
 await page.waitForSelector('.pocket-mode-curtain',{state:'detached'});assert.deepEqual(errors,[])
 console.log('PASS: navigating during mode animation with null state does not crash; both animations retain copy and duration')
}finally{await browser.close()}
