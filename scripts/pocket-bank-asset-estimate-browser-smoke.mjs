import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Estimate from './src/pocket/components/PocketFiatUsdcEstimate';function App(){const[asset,setAsset]=useState('USDC');return <><button onClick={()=>setAsset(asset==='USDC'?'USDT':'USDC')}>Change asset</button><Estimate amount={3000} asset={asset}/></>}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'}})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage()
 await page.route('https://pocket-test.invalid/**',async route=>{
  const url=new URL(route.request().url())
  if(!url.pathname.includes('fx-quote'))return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})
  const asset=url.searchParams.get('asset')||'USDC'
  if(asset==='USDT')await new Promise(resolve=>setTimeout(resolve,300))
  await route.fulfill({json:{ok:true,quote:{asset,currency:'NGN',symbol:'\u20a6',amount:'1',rate:asset==='USDT'?1000:1500,source:'paycrest',side:'sell',quotedAt:Date.now(),expiresAt:Date.now()+60000}}})
 })
 await page.goto('https://pocket-test.invalid/')
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByText('Est. 2 USDC before fees',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Change asset'}).click()
 assert.equal(await page.getByText('Est. 2 USDT before fees',{exact:true}).count(),0,'USDC rate must not be relabelled as USDT')
 await page.getByText('Est. 3 USDT before fees',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Change asset'}).click()
 await page.getByText('Est. 2 USDC before fees',{exact:true}).waitFor()
 console.log('PASS shared bank estimate switches assets without leaking a cached rate.')
} finally {await browser.close()}
