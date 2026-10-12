import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Estimate from './src/pocket/components/PocketFiatUsdcEstimate';import Confirmation from './src/pocket/components/PocketConfirmationDetails';function App(){const[asset,setAsset]=useState('USDC');return <><button onClick={()=>setAsset(asset==='USDC'?'USDT':'USDC')}>Change asset</button><Estimate amount={3000} asset={asset}/><Confirmation amount="NGN 3,000" equivalent={"2.00 "+asset} localAmountPrimary rows={[]}/><Confirmation amount="NGN 1,000" localAmountPrimary equivalentLoading rows={[]}/></>}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'}})
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
 await page.getByText('Est. 2.00 USDC before fees',{exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'NGN 3,000',exact:true}).count(),1,'Bank amount remains primary for both assets')
 await page.getByRole('button',{name:'Change asset'}).click()
 await page.getByRole('status',{name:'Loading USDT estimate',exact:true}).waitFor({state:'attached'})
 assert.equal(await page.getByRole('status',{name:'Updating payment estimate',exact:true}).count(),1)
 assert.equal(await page.getByText('Est. 2.00 USDT before fees',{exact:true}).count(),0,'USDC rate must not be relabelled as USDT')
 await page.getByText('Est. 3.00 USDT before fees',{exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'NGN 3,000',exact:true}).count(),1,'Bank amount remains primary for both assets')
 await page.getByRole('button',{name:'Change asset'}).click()
 await page.getByText('Est. 2.00 USDC before fees',{exact:true}).waitFor()
 console.log('PASS shared bank estimate switches assets without leaking a cached rate.')
} finally {await browser.close()}

