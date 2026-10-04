import assert from 'node:assert/strict'
import {build} from 'esbuild'
import fs from 'node:fs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 '../components/PocketXPayBankCheckout':`export default()=>{throw Error('Stock-funded bank checkout must not mount')}`,
 '../components/PocketUnifiedXPaySetup':`import React from'react';export const XPayBankSetup=()=>{throw Error('Bank setup must not mount in XStocks')};export const XPayWalletSetup=({setupKey,onCreated})=><button onClick={()=>onCreated('stocks')}>Finish stock setup</button>`,
 '../hooks/usePocketIdentity':`export default()=>({authenticated:true,email:'fixture@example.test',user:{id:'fixture'},getAccessToken:async()=>'fixture'})`,
 '../lib/pocketPaymentApproval':`export const requestPocketPaymentApproval=async()=>{};export const takePocketPaymentApproval=()=>({token:'pin',authorization:'Bearer fixture'})`,
}
const contents=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from'./src/pocket/pages/PocketUnifiedXPayPage';createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={[{pathname:window.publicFixture?'/xpay/checkout/xp_11111111-1111-4111-8111-111111111111':'/xpay',state:{xpayOrigin:'xstocks'}}]}><Page publicCheckout={!!window.publicFixture}/></MemoryRouter>)`
const bundle=await build({stdin:{contents,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"','import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'fixture'}:undefined);b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],resolveDir:process.cwd(),loader:'jsx'}))}}]})
const cssDir=fs.existsSync('.codex-temp/xpay-audit-dist/assets')?'.codex-temp/xpay-audit-dist/assets':'dist/assets'
const css=fs.readdirSync(cssDir).filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync(cssDir+'/'+f,'utf8')).join('\n')
const browser=await chromium.launch({channel:'chrome',headless:true})
fs.mkdirSync('output/playwright',{recursive:true})
try{for(const dark of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],actions=[]
 page.on('pageerror',e=>errors.push(e.message))
 const bank={id:'bank',name:'Test shop',kind:'bank',currency:'NGN',assets:['USDC'],revision:'1'}
 const stocks={id:'stocks',name:'Test shop',kind:'xstocks',currency:'USD',assets:['NVDAx'],revision:'1'}
 const terminal={id:'xp_11111111-1111-4111-8111-111111111111',name:'Test shop',version:0,createdAt:1,destinations:[bank]}
 await page.route('https://pocket.hashpaylink.com/**',async r=>{
  const u=new URL(r.request().url())
  if(u.pathname==='/api/pocket/xpay'){
   const b=r.request().method()==='GET'?null:r.request().postDataJSON();if(!b)return r.fulfill({json:{ok:true,checkout:terminal}})
   actions.push(b);let result={ok:true}
   if(b.action==='mine')Object.assign(result,{checkouts:[terminal],destinations:[bank,stocks],standaloneIds:[]})
   else if(b.action==='begin-setup'){assert.equal(b.kind,'wallet');assert.equal(b.id,terminal.id);result.key='terminal-stock-setup'}
   else if(b.action==='configure'){assert.equal(b.id,terminal.id);assert.equal(b.version,terminal.version);assert.ok(b.destinationIds.includes('bank'),'stock changes preserve bank receiving');assert.equal(r.request().headers()['x-pocket-payment-approval'],'pin');terminal.destinations=[bank,stocks].filter(d=>b.destinationIds.includes(d.id));terminal.version++;result.checkout=terminal}
   else if(b.action==='history'){assert.equal(b.rail,'xstocks');assert.equal(b.id,terminal.id);result.payments=[{id:'receipt',merchantName:'Test shop',rail:'xstocks',amount:'1.25',asset:'NVDAx',state:'successful',network:'xlayer',createdAt:Date.now()}];result.stockTotals=[{symbol:'NVDAx',amount:'1.25'}]}
   else throw Error('Unexpected management action '+b.action)
   return r.fulfill({json:result})
  }
  if(u.pathname.startsWith('/api/'))return r.fulfill({json:{ok:false,error:'Fixture unavailable'}})
  return r.fulfill({contentType:'text/html',body:'<style>body{margin:0}'+css+'</style><div id="root"></div>'})
 })
 await page.goto('https://pocket.hashpaylink.com/xpay');await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByRole('heading',{name:'Manage XPay',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Create QR',exact:true}).count(),0)
 await page.getByRole('button',{name:'Test shop',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:'Delete QR',exact:true}).count(),0)
 const qr=await page.locator('canvas').evaluate(c=>c.toDataURL())
 await page.getByRole('button',{name:'Payment options',exact:true}).click()
 assert.equal(await page.getByRole('button',{name:/Bank or mobile money/}).count(),0)
 await page.getByRole('button',{name:'XStocks Receive stocks in your XStocks wallet.'}).click();await page.getByRole('button',{name:'Finish stock setup'}).click()
 await page.getByRole('button',{name:'Remove XStocks'}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Remove Bank or mobile money'}).count(),0)
 await page.getByRole('button',{name:'Done',exact:true}).click()
 assert.equal(await page.locator('canvas').evaluate(c=>c.toDataURL()),qr)
 await page.getByRole('button',{name:'Payment history',exact:true}).click()
 await page.getByRole('region',{name:'Stocks received'}).getByText('1.25 NVDAx',{exact:true}).waitFor()
 assert.equal(await page.locator('[data-pocket-transaction-row]').count(),1)
 await page.screenshot({path:'output/playwright/xpay-stock-history-'+dark+'.png'})
 await page.getByRole('button',{name:'Download statement',exact:true}).click();await page.getByText('XPay payments only.',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Bank transfers & bills'}).count(),0)
 assert.equal(actions.some(a=>['create','adopt','delete'].includes(a.action)),false)
 assert.deepEqual(errors,[])
 terminal.destinations.push({id:'stablecoins',name:'Test shop',kind:'stablecoins',currency:'USDC',assets:['USDC'],networks:['base','arbitrum'],revision:'1'})
 // Public bank checkout uses the existing Base USDC POS route directly.
 await page.addInitScript(()=>{window.publicFixture=true})
 await page.route('https://app.hashpaylink.com/**',r=>r.fulfill({contentType:'text/html',body:'Existing bank checkout'}))
 await page.goto('https://pocket.hashpaylink.com/xpay/checkout/'+terminal.id);await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL('https://app.hashpaylink.com/pos/ng?**')
 assert.equal(new URL(page.url()).searchParams.get('xpay_checkout_id'),terminal.id)
 assert.equal(actions.some(a=>a.action==='prepare'),false)
 await page.goto('https://pocket.hashpaylink.com/xpay/checkout/'+terminal.id);await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByText('USDC on Stablecoins',{exact:true}).click();await page.getByRole('button',{name:'Receiving network',exact:true}).click();await page.getByRole('option').filter({hasText:'Arbitrum'}).click();await page.getByRole('button',{name:'Continue',exact:true}).click();await page.waitForURL('https://app.hashpaylink.com/pos/ng?**');assert.equal(new URL(page.url()).searchParams.get('n'),'arbitrum');assert.equal(new URL(page.url()).searchParams.get('merchant_id'),'stablecoins');assert.equal(new URL(page.url()).searchParams.get('xpay_checkout_id'),terminal.id)

 await page.close()
}
console.log('PASS XStocks manages existing terminals only, stock configuration preserves bank/QR, scoped receipts/totals, no second creator, and bank checkout uses Stablecoins without conversion in both themes.')
}finally{await browser.close()}
