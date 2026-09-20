import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,readdirSync,mkdirSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 '../components/PocketRouteShell':`import React from 'react';export default function Shell({children}){return <main className="p-4 space-y-4">{children}</main>}`,
 '../hooks/usePocketIdentity':`export default ()=>({authenticated:true,email:'fixture@example.invalid',getAccessToken:async()=>'fixture'})`,
 '../hooks/usePocketWallets':`export default ()=>({resolved:true,error:null,total:window.balance,totalComplete:true,rows:[{key:'base',balance:window.balance}],walletUpdate:'hidden'})`,
 '../hooks/usePocketProfile':`export default ()=>({profile:{displayCurrency:'USD'}})`,
 '../hooks/usePocketActivity':`export default ()=>({resolved:true,rows:[]})`,
 '../hooks/usePocketFxQuote':`export default ()=>({quote:null,busy:false})`,
}
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter,Routes,Route} from 'react-router-dom';import Home from './src/pocket/pages/PocketHomePage';const root=createRoot(document.getElementById('root'));window.mount=balance=>{window.balance=balance;root.render(<MemoryRouter><Routes><Route path='/' element={<Home key={balance}/>}/><Route path='/pocket/home/scan' element={<p>Scan opened</p>}/></Routes></MemoryRouter>)}`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const assets='.codex-temp/preparation-build/assets';const css=readdirSync(assets).filter(f=>f.endsWith('.css')).map(f=>readFileSync(assets+'/'+f,'utf8')).join('\n')
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();await page.route('https://fixture.invalid/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid/');await page.addStyleTag({content:css});await page.addScriptTag({content:bundle.outputFiles[0].text})
 for(const width of [320,390,480])for(const balance of [3.5,12345.67]){
  await page.setViewportSize({width,height:844});await page.evaluate(b=>window.mount(b),balance);await page.getByRole('button',{name:'Scan',exact:true}).waitFor()
  const send=await page.getByRole('button',{name:'Send',exact:true}).boundingBox(),scan=await page.getByRole('button',{name:'Scan',exact:true}).boundingBox(),swap=await page.getByRole('button',{name:'Swap',exact:true}).boundingBox()
  assert.ok(send.x<scan.x&&scan.x<swap.x);assert.ok(swap.x+swap.width<=width)
  const amount=await page.locator('section').first().locator('p').nth(1).boundingBox();assert.ok(amount.y+amount.height<=send.y||amount.x+amount.width<=send.x,`balance overlaps actions at width ${width}`)
 }
 mkdirSync('output/playwright',{recursive:true});await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.mount(3.5));await page.screenshot({path:'output/playwright/pocket-home-scan-local.png'})
 await page.getByRole('button',{name:'Scan',exact:true}).click();await page.getByText('Scan opened',{exact:true}).waitFor()
 console.log('PASS: Send, Scan, Swap appear once, stay in order at mobile widths, do not overlap the balance, and Scan opens its route.')
}finally{await browser.close()}
