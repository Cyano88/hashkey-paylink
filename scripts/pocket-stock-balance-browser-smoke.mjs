import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@example.test',user:{id:'fixture'},getAccessToken:async()=>'fixture'})`,
 usePocketStockWallet:`export default()=>window.stockWallet`,
 usePocketStockCurrency:`export default()=>({currency:'USDC'})`,
 usePocketDisplayCurrency:`export default()=> 'USDC'`,
 usePocketFxQuote:`export default()=>({quote:null,loading:false})`,
 usePocketProfile:`export default()=>({profile:{pocketId:'fixture'}})`,
 usePocketActivity:`export default()=>({rows:[],resolved:true})`,
 usePocketWallets:`export default()=>({displayRows:[{key:'base',known:true,balance:500}],displayTotal:1250,displayComplete:true,wallets:{},walletBusy:false})`,
 usePocketStockQuotes:`export default()=>({quotes:window.prices,displayQuotes:window.prices,busy:window.loading,stale:window.stale})`,
 PocketXPay:`export default()=>null`,PocketStockActivity:`export default()=>null`,PocketStockWalletActions:`export default()=>null`,PocketStockNotifications:`export default()=>null`,PocketStockTransferMenu:`export default()=>null`,
}
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Stocks from'./src/pocket/pages/PocketXStocksPage';import Home from'./src/pocket/pages/PocketHomePage';import{stockAssets,stockUsdc,stockGasPriceAddress}from'./src/pocket/lib/pocketXStocksWallet';const asset=stockAssets.find(a=>a.symbol==='NVDAx');window.stockWallet={address:'0x'+'1'.repeat(40),ready:true,busy:false,snapshot:{holdings:[{asset,units:5000000000000000000n,decimals:18}],cash:500000000n,gas:200000000000000000n,complete:true,observedAt:Date.now()}};window.prices={[asset.address.toLowerCase()]:{usd:146,fetchedAt:Date.now()},[stockUsdc.address.toLowerCase()]:{usd:1,fetchedAt:Date.now()},[stockGasPriceAddress]:{usd:100,fetchedAt:Date.now()}};window.gasKey=stockGasPriceAddress;const root=createRoot(document.getElementById('root'));window.mount=kind=>root.render(<MemoryRouter key={kind} initialEntries={[kind==='stocks'?'/xstocks/home':'/home']}>{kind==='stocks'?<Stocks view="home"/>:<Home/>}</MemoryRouter>);`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').at(-1);return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path]}))}}]})
const cssDir=process.env.POCKET_TEST_CSS_DIR || 'dist/assets',css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(cssDir+'/'+f,'utf8')).join('\n')
const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('output/playwright',{recursive:true})
try{for(const dark of [false,true])for(const width of [320,390,430]){
 const p=await browser.newPage({viewport:{width,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message))
 await p.route('https://pocket.hashpaylink.com/**',r=>r.fulfill({contentType:'text/html',body:'<html class="'+(dark?'dark':'')+'"><style>html,body,#root{height:100%;margin:0}'+css+'</style><div id="root"></div></html>'}));await p.goto('https://pocket.hashpaylink.com/');await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.evaluate(()=>window.mount('stablecoins'));const card=p.locator('[data-pocket-balance-card]');await card.getByText('Total USDC',{exact:true}).waitFor();const baseline=await card.boundingBox()
 await p.evaluate(()=>window.mount('stocks'));await card.getByText('Total value',{exact:true}).waitFor();const stock=await card.boundingBox();assert.equal(stock.width,baseline.width);assert.equal(stock.height,baseline.height,JSON.stringify({width,dark,baseline,stock}))
 assert.match(await card.innerText(),/1,250/);assert.equal(await card.getByText('X Layer',{exact:true}).count(),0)
 await card.getByRole('button',{name:'Spendable. Show Stocks invested'}).click();assert.match(await card.innerText(),/730/)
 await card.getByRole('button',{name:'Stocks invested. Show Transaction fees'}).click();assert.match(await card.innerText(),/0.2/)
 assert.equal((await card.boundingBox()).height,baseline.height)
 await card.getByRole('button',{name:'Transaction fees. Show Spendable'}).click();assert.match(await card.innerText(),/500/)
 await card.getByRole('button',{name:'Hide balances'}).click();assert.doesNotMatch(await card.innerText(),/1,250|500/)
 await card.getByRole('button',{name:'Show balances'}).click()
 if(width===390)await card.screenshot({path:'output/playwright/stock-balance-'+dark+'.png'})
 await p.evaluate(()=>{delete window.prices[window.gasKey];window.mount('stablecoins')});await card.getByText('Total USDC',{exact:true}).waitFor();await p.evaluate(()=>window.mount('stocks'));await card.getByText('Total value',{exact:true}).waitFor();assert.doesNotMatch(await card.innerText(),/1,250/);assert.match(await card.innerText(),/Unavailable/);assert.match(await card.innerText(),/500/)
 assert.deepEqual(errors,[]);await p.close()
}console.log('PASS exact Stablecoins card width/height at 320/390/430px in both themes, three-way balance cycling, visibility and unavailable-price behavior.')}finally{await browser.close()}
