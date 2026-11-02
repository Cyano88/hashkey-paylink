import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdir,readFile} from 'node:fs/promises'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const checkout={id:'chks_'+'a'.repeat(24),amount:'1.5',merchantName:'Lunchroom',expiresAt:new Date(Date.now()+900000).toISOString(),defaultNetwork:'base',options:[{network:'base',asset:'USDC'},{network:'base',asset:'USDT'},{network:'xlayer',asset:'USDC'}]}
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Choice from './src/pocket/components/PocketHostedCheckoutChoice';createRoot(document.getElementById('root')).render(<Choice checkout={window.fixture} onSelected={path=>window.selected=path} onClose={()=>window.fixtureClosed=true}/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'native-fixture',setup(b){
 b.onResolve({filter:/PocketNetworkBalance$|PocketUpcomingXLayer$|pocketRoutes$/},a=>({path:a.path,namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('pocketRoutes')?'export const HASH_PAYLINK_APP_ORIGIN="https://app.hashpaylink.com";export const POCKET_ORIGIN="https://pocket.hashpaylink.com";export const isPocketNativeRuntime=()=>true;export const pocketApiUrl=p=>p':'export default()=>null'}))
}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
 for(const width of [320,390])for(const dark of [false,true]){
  const page=await browser.newPage({viewport:{width,height:844}}),writes=[],errors=[];page.on('pageerror',e=>errors.push(e.message))
  let response={ok:true,selectedCheckoutUrl:'https://evil.test/pay'}
  await page.route('https://checkout.test/**',async route=>{
   const p=new URL(route.request().url()).pathname
   if(p.startsWith('/api/')){writes.push(route.request().postDataJSON());await new Promise(r=>setTimeout(r,150));return route.fulfill({json:response})}
   if(p.startsWith('/brand/')){try{return route.fulfill({body:await readFile('public'+p),contentType:p.endsWith('.svg')?'image/svg+xml':'image/png'})}catch{return route.fulfill({status:404})}}
   return route.fulfill({contentType:'text/html',body:`<html class="${dark?'dark':''}"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><div id="root"></div><script>window.fixture=${JSON.stringify(checkout)}</script><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script></html>`})
  })
  await page.goto('https://checkout.test/');await page.getByRole('dialog',{name:'Choose payment',exact:true}).waitFor()
  assert.equal(writes.length,0)
  assert.match(await page.getByRole('button',{name:'Payment network',exact:true}).innerText(),/Base/)
  await page.getByRole('button',{name:'Payment network',exact:true}).click()
  await page.keyboard.press('Escape')
  assert.equal(await page.evaluate(()=>!!window.fixtureClosed),false,'Back closes the network picker before checkout')
  const next=page.getByRole('button',{name:'Continue',exact:true})
  await next.evaluate(el=>{el.click();el.click()})
  await page.getByRole('alert').filter({hasText:'Checkout could not be verified.'}).waitFor()
  assert.equal(writes.length,1);assert.equal(await page.evaluate(()=>window.selected),undefined)
  response={ok:true,selectedCheckoutUrl:'/pay/c/chkx_'+'b'.repeat(24)+'?attempt=pat_fixture'}
  await next.click();await page.waitForFunction(()=>!!window.selected)
  assert.deepEqual(writes,[{network:'base',asset:'USDC'},{network:'base',asset:'USDC'}])
  assert.equal(await page.evaluate(()=>window.selected),response.selectedCheckoutUrl)
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await mkdir('output/playwright',{recursive:true});await page.screenshot({path:`output/playwright/native-checkout-choice-${width}-${dark?'dark':'light'}.png`})
  assert.deepEqual(errors,[]);await page.close()
 }
 const page=await browser.newPage({viewport:{width:390,height:844}})
 await page.route('**/*',route=>route.fulfill({contentType:'text/html',body:`<div id="root"></div><script>window.fixture=${JSON.stringify({...checkout,expiresAt:'2020-01-01T00:00:00Z'})}</script><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`}))
 await page.goto('https://checkout.test/');await page.getByText('Payment session expired. Start a new checkout.',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Continue',exact:true}).isDisabled(),true)
 await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.evaluate(()=>window.fixtureClosed),true)
 await page.close()
 console.log('PASS native checkout choice: mobile light/dark, nested Back, explicit selection, duplicate-tap lock, hostile response rejection, attempt preservation and expired/close behaviour.')
}finally{await browser.close()}
