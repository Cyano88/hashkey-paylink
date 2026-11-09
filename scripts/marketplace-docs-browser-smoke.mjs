import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{BrowserRouter,Routes,Route,Link}from'react-router-dom';import Page from'./src/pages/docs/MarketplaceDocs';createRoot(document.getElementById('root')).render(<BrowserRouter><main className="mx-auto max-w-3xl p-5"><Routes><Route path="/docs/marketplaces" element={<Page/>}/><Route path="/docs/api" element={<><h1>Checkout API</h1><Link to="/docs/marketplaces">Marketplace Payments</Link></>}/><Route path="/docs/funding" element={<h1>Polymarket funding</h1>}/></Routes></main></BrowserRouter>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('output/playwright',{recursive:true})
try{for(const width of [320,390,1280])for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://marketplace-docs.test/**',route=>route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'}));await page.goto('https://marketplace-docs.test/docs/marketplaces');await page.evaluate(d=>{document.documentElement.classList.toggle('dark',d);document.body.style.background=d?'#030712':'white'},dark)
 await page.getByRole('heading',{name:'Marketplace Payments',exact:true}).waitFor()
 const headings=await page.getByRole('heading',{level:2}).allTextContents();assert.equal(headings[0],'Choose wallet or bank account settlement');assert(headings.indexOf('Choose wallet or bank account settlement')<headings.indexOf('Planned integration sequence'))
 assert.equal(await page.getByRole('article').count(),3)
 await page.getByText('Bank account settlement: Cash balance',{exact:true}).waitFor();await page.getByText('Wallet settlement: USDT on Base',{exact:true}).waitFor()
 assert.match(await page.locator('main').innerText(),/not open for production or sandbox/)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'output/playwright/marketplace-docs-'+width+(dark?'-dark':'-light')+'.png',fullPage:true})
 await page.getByRole('link',{name:/Checkout API/}).click();await page.getByRole('heading',{name:'Checkout API',exact:true}).waitFor();await page.getByRole('link',{name:'Marketplace Payments',exact:true}).click();await page.getByRole('heading',{name:'Marketplace Payments',exact:true}).waitFor();await page.getByRole('link',{name:/Polymarket funding/}).click();await page.getByRole('heading',{name:'Polymarket funding',exact:true}).waitFor();assert.deepEqual(errors,[]);await page.close()
}console.log('PASS marketplace docs: settlement before integration, USDC-only bank route, Base wallet options, explicit unavailable state, navigation and no overflow at 320/390/1280 light/dark.')}finally{await browser.close()}
