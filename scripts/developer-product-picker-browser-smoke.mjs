import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Picker from './src/developer/ProductPicker';function App(){const[value,setValue]=useState(['hosted_checkout']);window.setCapabilities=setValue;window.capabilities=value;return <main className="mx-auto max-w-2xl p-6"><h1 className="text-2xl font-semibold">One API. Choose your capabilities.</h1><p className="mt-2 text-sm text-gray-500">Local configuration preview. Changes here are not saved to a project.</p><Picker mode="human" value={value} onChange={setValue}/></main>}createRoot(document.getElementById('root')).render(<App/>);`
const b=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const css=readFileSync('.codex-temp/browser-checkout.css','utf8')
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink API configuration preview</title><style>'+css+'</style></head><body><div id="root"></div><script>'+b.outputFiles[0].text+'</script></body></html>'
mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/developer-products-preview.html',html)
const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage({viewport:{width:1024,height:1100}});await page.setContent(html)
 assert.deepEqual(await page.locator('legend').allTextContents(),['Checkout','Agreements','Swap'])
 const swap=page.locator('fieldset').filter({has:page.locator('legend',{hasText:'Swap'})})
 assert.equal(await swap.getByRole('checkbox').count(),1,'new projects only see X Layer Swap')
 await page.getByRole('checkbox',{name:/Eligible xStocks\. Trade funding/}).click()
 assert.equal(await swap.getByRole('checkbox').getAttribute('aria-checked'),'false','Agreements must not enable Swap')
 await swap.getByRole('checkbox').click()
 assert.equal(await page.getByRole('checkbox',{name:/Hosted checkout/}).getAttribute('aria-checked'),'true')
 assert.ok((await page.evaluate(()=>window.capabilities)).includes('swap_xlayer'))
 assert.equal(await page.getByText('Bridge',{exact:true}).count(),0)
 await page.screenshot({path:'output/playwright/developer-products-desktop.png',fullPage:true})
 await page.evaluate(()=>window.setCapabilities(['hosted_checkout','swap_arc']))
 assert.equal(await swap.getByRole('checkbox').count(),2,'existing Arc Swap stays manageable')
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.setCapabilities(['hosted_checkout']))
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'output/playwright/developer-products-mobile.png',fullPage:true})
 console.log('PASS: three categories, independently selected Swap, preserved existing Arc configuration, no unavailable Bridge choice, mobile layout.')
}finally{await browser.close()}
