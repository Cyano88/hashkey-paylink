import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {writeFileSync,mkdirSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Picker from './src/developer/ProductPicker';function App(){const[value,setValue]=useState(['hosted_checkout']);window.setCapabilities=setValue;window.capabilities=value;return <main className="mx-auto max-w-2xl p-6"><h1 className="text-2xl font-semibold">How will customers use your app?</h1><p className="mt-2 text-sm text-gray-500">Local configuration preview. Changes here are not saved to a project.</p><Picker mode="human" value={value} onChange={setValue}/></main>}createRoot(document.getElementById('root')).render(<App/>);`
const b=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const css=await checkoutTestCss()
const html='<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink API configuration preview</title><style>'+css+'</style></head><body><div id="root"></div><script>'+b.outputFiles[0].text+'</script></body></html>'
mkdirSync('output/playwright',{recursive:true});writeFileSync('output/playwright/developer-products-preview.html',html)
const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage({viewport:{width:1024,height:1100}});await page.setContent(html)
 assert.deepEqual(await page.locator('legend').allTextContents(),['What would you like to do?'])
 assert.equal(await page.getByRole('checkbox').count(),3)
 assert.equal(await page.getByRole('checkbox',{name:/Marketplace Payments/}).isDisabled(),false)
 await page.getByRole('checkbox',{name:/Accept payments/}).click()
 assert.equal(await page.getByRole('checkbox',{name:/Accept payments/}).getAttribute('aria-checked'),'true','one current product is required')
 await page.getByRole('checkbox',{name:/Fund Polymarket/}).click()
 await page.getByRole('checkbox',{name:/Accept payments/}).click()
 assert.deepEqual(await page.evaluate(()=>window.capabilities),['polymarket_funding'])
 await page.getByRole('checkbox',{name:/Marketplace Payments/}).click()
 await page.getByRole('checkbox',{name:/Fund Polymarket/}).click()
 assert.deepEqual(await page.evaluate(()=>window.capabilities),['marketplace_payments'])
 await page.getByRole('checkbox',{name:/Marketplace Payments/}).click()
 assert.deepEqual(await page.evaluate(()=>window.capabilities),['marketplace_payments'],'marketplace alone satisfies registration')
 await page.getByRole('checkbox',{name:/Accept payments/}).click()
 await page.getByRole('checkbox',{name:/Marketplace Payments/}).click()
 assert.deepEqual(await page.evaluate(()=>window.capabilities),['hosted_checkout'])
 await page.screenshot({path:'output/playwright/developer-products-desktop.png',fullPage:true})
 await page.evaluate(()=>window.setCapabilities(['hosted_checkout','swap_arc']))
 await page.getByRole('checkbox',{name:/Fund Polymarket/}).click()
 assert.ok((await page.evaluate(()=>window.capabilities)).includes('swap_arc'),'existing legacy capability is preserved')
 assert.equal(await page.getByRole('checkbox').count(),3,'legacy products are not offered')
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.setCapabilities(['hosted_checkout']))
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'output/playwright/developer-products-mobile.png',fullPage:true})
 console.log('PASS: checkout choices plus selectable marketplace early access, at least one required, preserved legacy configuration, mobile layout.')
}finally{await browser.close()}
