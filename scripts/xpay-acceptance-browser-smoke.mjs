import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const destination={id:'wallet',name:'Restaurant',kind:'stablecoins',currency:'USDC',assets:['USDC'],networks:['base','arbitrum','solana'],revision:'1'}
const checkout={id:'fixture',name:'Restaurant',createdAt:1,destinations:[destination]}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import Settings from './src/pocket/components/PocketXPayAcceptanceSettings';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-md space-y-5 bg-white p-4 text-gray-950 dark:bg-black dark:text-white"><h1>Accepted payments</h1><Settings checkout={window.checkout} onSave={async value=>{window.saves.push(value);await new Promise(resolve=>setTimeout(resolve,300));if(window.fail)throw Error('This terminal changed. Reopen it before saving.')}}/></main>);`
const bundle=await build({stdin:{contents:entry,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'}})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const width of [320,390])for(const dark of [false,true]){
  const p=await browser.newPage({viewport:{width,height:844}})
  await p.route('https://fixture.invalid/**',async route=>{const path=new URL(route.request().url()).pathname;if(path.startsWith('/brand/'))return route.fulfill({body:readFileSync('public'+path),contentType:path.endsWith('.png')?'image/png':'image/jpeg'});return route.fulfill({contentType:'text/html',body:'<html></html>'})});await p.goto('https://fixture.invalid/');
  await p.setContent(`<html class="${dark?'dark':''}"><style>${css}</style><div id="root"></div></html>`)
  await p.evaluate(c=>{window.checkout=c;window.saves=[]},checkout)
  await p.addScriptTag({content:bundle.outputFiles[0].text})
  const boxes=p.getByRole('checkbox'),save=p.getByRole('button',{name:'Save changes'})
  assert.equal(await boxes.count(),3)
  await p.getByLabel('Cash balance coming soon').waitFor()
  assert.equal(await p.getByRole('checkbox',{name:/Cash/}).count(),0)
  assert(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  await p.locator('img').evaluateAll(async images=>{await Promise.all(images.map(image=>image.decode()))});
  await p.screenshot({path:'.codex-temp/xpay-acceptance-'+width+'-'+(dark?'dark':'light')+'.png'})
  for(const box of await boxes.all())await box.uncheck()
  assert(await save.isDisabled())
  await p.getByRole('checkbox',{name:'Accept USDC on Arbitrum',exact:true}).check()
  await save.evaluate(el=>{el.click();el.click()})
  await p.getByRole('status',{name:'Saving payment options'}).waitFor()
  assert(await boxes.first().isDisabled())
  await save.waitFor()
  assert.deepEqual(await p.evaluate(()=>window.saves),[{version:1,cashBalance:false,routes:[{destinationId:'wallet',revision:'1',network:'arbitrum',asset:'USDC'}]}])
  await p.evaluate(()=>window.fail=true)
  await save.click()
  await p.getByRole('alert').waitFor()
  assert.match(await p.getByRole('alert').innerText(),/terminal changed/)
  assert(await p.getByRole('checkbox',{name:'Accept USDC on Arbitrum',exact:true}).isChecked())
  await p.close()
 }
 console.log('PASS acceptance UI 320/390 light/dark, valid selection, duplicate save prevention, shimmer, disabled cash, and retryable save failure.')
}finally{await browser.close()}
