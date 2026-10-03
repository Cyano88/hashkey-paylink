import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@example.test',user:{id:'fixture'},getAccessToken:async()=>'fixture'})`,
 usePocketStockWallet:`export default()=>window.fixtureWallet`,
 usePocketStockCurrency:`export default()=>({currency:'USDC'})`,
 usePocketFxQuote:`export default()=>({quote:null})`,
 usePocketProfile:`export default()=>({profile:{pocketId:'fixture'}})`,
 usePocketStockQuotes:`export default()=>({quotes:{},displayQuotes:{},busy:false,stale:false})`,
 pocketStockSwapClient:`export async function stockSwapRequest(_,body){window.quotes.push(body);throw Error('No executable quote is available for this pair and amount.')}`,
 PocketXPay:`export default()=>null`,PocketStockActivity:`export default()=>null`,PocketStockWalletActions:`export default()=>null`,PocketStockNotifications:`export default()=>null`,PocketStockTransferMenu:`export default()=>null`,
}
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation}from'react-router-dom';import Page from'./src/pocket/pages/PocketXStocksPage';import Nav from'./src/pocket/components/PocketBottomNav';import{resolvePocketRoute}from'./src/pocket/lib/pocketRoutes';import{stockAssets,stockUsdc}from'./src/pocket/lib/pocketXStocksWallet';window.assets=Object.fromEntries([...stockAssets,stockUsdc].map(a=>[a.symbol,a.address]));window.quotes=[];window.fixtureWallet={address:'0x'+'1'.repeat(40),ready:true,busy:false,snapshot:{holdings:[],gas:1000000000000000000n,cash:100000000n,complete:true,observedAt:Date.now()}};function App(){const l=useLocation();window.route=l;const r=resolvePocketRoute(l.pathname);return l.pathname==='/xpay'?<><p>Manage XPay fixture</p><Nav rail={l.state.xpayOrigin} active="xpay" onSelect={()=>{}}/></>:l.pathname==='/home'?<Nav rail="stablecoins" active="home" onSelect={()=>{}}/>:<Page view={r.view}/>};createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[window.startPath||'/xstocks/home']}><App/></MemoryRouter>)`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').at(-1);return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const cssDir=process.env.POCKET_TEST_CSS_DIR || 'dist/assets',css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(cssDir+'/'+f,'utf8')).join('\n')
const browser=await chromium.launch({channel:'chrome',headless:true})
fs.mkdirSync('output/playwright',{recursive:true})
try{for(const dark of [false,true]){
 const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));p.setDefaultTimeout(10000)
 await p.route('https://pocket.hashpaylink.com/**',r=>r.fulfill({contentType:'text/html',body:'<html class="'+(dark?'dark':'')+'"><style>html,body,#root{height:100%;margin:0}'+css+'</style><div id="root"></div></html>'}))
 await p.goto('https://pocket.hashpaylink.com/');await p.addScriptTag({content:bundle.outputFiles[0].text})
 const nav=p.getByRole('navigation',{name:'Pocket navigation'})
 assert.equal(await nav.getByRole('button',{name:'XStocks',exact:true}).count(),0)
 const stockIcon=await nav.getByRole('button',{name:'XPay',exact:true}).locator('svg').innerHTML()
 await p.getByRole('button',{name:'Buy / Sell',exact:true}).click()
 await p.getByRole('button',{name:'Buy',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Swap',exact:true}).count(),0)
 await p.getByRole('textbox').fill('1');await p.waitForFunction(()=>window.quotes.length>0)
 assert.equal(await p.evaluate(()=>window.quotes.at(-1).tokenIn===window.assets.USDC),true)
 await p.getByRole('button',{name:'Sell',exact:true}).click();await p.waitForFunction(()=>window.quotes.at(-1)?.tokenOut===window.assets.USDC)
 await p.screenshot({path:'output/playwright/stock-buy-sell-'+dark+'.png'})
 await p.getByRole('button',{name:'Back',exact:true}).click();await p.getByRole('button',{name:'Swap',exact:true}).click()
 assert.equal(await p.getByRole('button',{name:'Buy',exact:true}).count(),0);assert.equal(await p.getByRole('button',{name:'Sell',exact:true}).count(),0)
 const select=async(label,symbol)=>{await p.getByRole('button',{name:label,exact:true}).click();const dialog=p.getByRole('dialog',{name:label});await dialog.getByText(symbol,{exact:true}).first().click()}
 await select('From asset','OKB');await p.getByRole('textbox').fill('1');await p.waitForFunction(()=>window.quotes.at(-1)?.tokenIn==='native')
 await select('From asset','AAPLx');await select('To asset','TSLAx');await p.waitForFunction(()=>window.quotes.at(-1)?.tokenIn===window.assets.AAPLx&&window.quotes.at(-1)?.tokenOut===window.assets.TSLAx)
 await p.getByRole('alert').filter({hasText:'No executable quote'}).waitFor();assert.equal(await p.getByRole('button',{name:'Swap AAPLx for TSLAx'}).isDisabled(),true)
 await p.screenshot({path:'output/playwright/stock-swap-'+dark+'.png'})
 await nav.getByRole('button',{name:'XPay',exact:true}).click();await p.getByText('Manage XPay fixture').waitFor();assert.equal(await p.evaluate(()=>window.route.state.xpayOrigin),'xstocks');assert.equal(await nav.getByRole('button',{name:'XPay',exact:true}).getAttribute('aria-current'),'page')
 await p.reload();await p.evaluate(()=>window.startPath='/home');await p.addScriptTag({content:bundle.outputFiles[0].text});assert.equal(await nav.getByRole('button',{name:'XPay',exact:true}).locator('svg').innerHTML(),stockIcon)
 await nav.getByRole('button',{name:'XPay',exact:true}).click();await p.getByText('Manage XPay fixture').waitFor();assert.equal(await p.evaluate(()=>window.route.state.xpayOrigin),'stablecoins')
 assert.deepEqual(errors,[]);await p.close()
}console.log('PASS shared XPay icon and rail origin; home shortcuts; USDC Buy/Sell; separate OKB/stock Swap; unsupported quote blocks submission in both themes.')}finally{await browser.close()}
