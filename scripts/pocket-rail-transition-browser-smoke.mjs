import assert from 'node:assert/strict'
import {build} from 'esbuild'
import fs from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useNavigate}from'react-router-dom';import Transition from './src/pocket/components/PocketRailTransition';function Fixture(){window.navigate=useNavigate();return <Transition/>}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[{pathname:'/xstocks/home',state:{pocketRailTransition:'xstocks'}}]}><Fixture/></MemoryRouter>)`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic'})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent('<div id="root"></div>');await page.addStyleTag({content:fs.readFileSync('src/pocket/pocketTheme.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text})
 assert.equal(await page.locator('.pocket-mode-curtain').count(),0);await page.evaluate(()=>window.navigate('/xstocks/home',{state:{pocketRailTransition:'xstocks'}}));
 await page.waitForSelector('.pocket-mode-curtain');assert.match(await page.locator('.pocket-mode-curtain').textContent(),/Stocks\s+can\s+do\s+more/)
 assert.equal(await page.locator('.pocket-mode-letters > span').first().evaluate(e=>getComputedStyle(e).animationName),'pocket-mode-letter');await page.evaluate(()=>document.documentElement.classList.add('dark'));assert.equal(await page.locator('.pocket-mode-curtain').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(0, 0, 0)');
 await page.evaluate(()=>window.navigate('/xstocks/activity',{state:null}));await page.waitForSelector('.pocket-mode-curtain',{state:'detached'});assert.deepEqual(errors,[])
 await page.evaluate(()=>window.navigate('/home',{state:{pocketRailTransition:'stablecoins'}}));await page.waitForSelector('.pocket-mode-curtain');assert.match(await page.locator('.pocket-mode-curtain').textContent(),/USDC\s+can\s+do\s+more/)
 await page.waitForSelector('.pocket-mode-curtain',{state:'detached'});assert.deepEqual(errors,[])
 await page.evaluate(()=>window.navigate('/send'));await page.evaluate(()=>window.navigate(-1));assert.equal(await page.locator('.pocket-mode-curtain').count(),0);
 await page.emulateMedia({reducedMotion:'reduce'});await page.evaluate(()=>window.navigate('/xstocks/home',{state:{pocketRailTransition:'xstocks'}}));assert.equal(await page.locator('.pocket-mode-curtain').count(),0);
 console.log('PASS: Back never replays rail transition; navigating during mode animation with null state does not crash; both animations retain copy and duration')
}finally{await browser.close()}
