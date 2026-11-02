import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:"import React from 'react';import{createRoot}from'react-dom/client';import Boot from './src/pocket/components/PocketBootFallback';createRoot(document.getElementById('root')).render(<Boot/>);",loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const page=await browser.newPage()
 await page.clock.install()
 await page.route('https://boot.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'}))
 await page.goto('https://boot.test')
 await page.getByRole('heading',{name:'Opening Pocket'}).waitFor()
 assert.equal(await page.getByRole('status').innerText(),'Please wait a moment.')
 assert.equal(await page.getByRole('button',{name:'Try again'}).count(),0)
 let reloads=0
 page.on('request',r=>{if(r.isNavigationRequest())reloads++})
 await page.clock.fastForward(15001)
 await page.getByRole('button',{name:'Try again'}).waitFor()
 assert.equal(reloads,0)
 await page.getByRole('button',{name:'Try again'}).click()
 await page.waitForFunction(()=>document.querySelector('[role="status"]')?.textContent==='Please wait a moment.')
 assert.equal(reloads,1)
 console.log('PASS startup displays progress, slow startup exposes manual retry, no automatic reload, retry restarts the page.')
}finally{await browser.close()}
