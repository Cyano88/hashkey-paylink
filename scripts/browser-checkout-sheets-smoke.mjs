import {checkoutTestCss} from './checkout-test-css.mjs'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')

const source = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Action from './src/pocket/components/PocketPosPaymentAction';import Result from './src/components/BrowserPaymentResult';
function App(){const[state,setState]=useState('review');window.setPaymentState=setState;return <main className="mx-auto max-w-md px-5 py-12"><p className="mb-8 text-center text-sm font-semibold">Hash PayLink · Preview</p><section className="rounded-3xl border border-gray-200 bg-white p-6 dark:border-neutral-800 dark:bg-black"><p className="text-center text-sm text-gray-500">Demo Store</p><h1 className="my-5 text-center text-3xl font-bold">12.00 USDC</h1><p className="mb-6 text-center text-sm text-gray-500">Purchase · Base</p>{state==='review'?<Action pocket={false} webReview amount="12.00 USDC" rows={[["Merchant","Demo Store"],["Network","Base"],["Fee","0.03 USDC"],["Network cost","0.00 USDC"],["Total","12.03 USDC"]]} status="idle" disabled={false} onConfirm={()=>{window.sends++;setState('pending')}}/>:<Result state={state} merchant="Demo Store" amount="12.00 USDC" detail="Waiting for payment verification. Do not pay again." returnUrl="https://merchant.example/receipt" onCheckStatus={()=>{window.checks++;setState('successful')}}/>}</section><p className="mt-5 text-center text-xs text-gray-500">Synthetic preview. No funds move.</p></main>};window.sends=0;window.checks=0;createRoot(document.getElementById('root')).render(<MemoryRouter><App/></MemoryRouter>);`
const bundle = await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'safe-preview',setup(b){b.onResolve({filter:/PocketDepositPage$|PocketLocalEquivalent$|pocketPaymentApproval$|UnifiedReceipt$|PocketGetApp$/},a=>({path:a.path,namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:a.path.endsWith('pocketPaymentApproval')?`export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='cancel';export const preparePocketPaymentApproval=async()=>{throw Error('Unexpected native preparation')};export const requestPocketPaymentApproval=async()=>{throw Error('Unexpected native approval')}`:a.path.endsWith('UnifiedReceipt')?'export const FullScreenReceiptSurface=()=>null':'export default ()=>null'}))}}]})
const css = await checkoutTestCss()
const script = bundle.outputFiles[0].text
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Browser checkout preview</title><style>'+css+'</style></head><body class="bg-gray-50 text-gray-950 dark:bg-black dark:text-white"><div id="root"></div><script>'+script.replaceAll('</script','<\\/script')+'</script></body></html>'
mkdirSync('output/playwright',{recursive:true})
writeFileSync('output/playwright/browser-checkout-preview.html',html)
const browser = await chromium.launch({channel:'chrome',headless:true})
try {
 for (const width of [390,1280]) for (const dark of [false,true]) {
  const page = await browser.newPage({viewport:{width,height:844}})
  const errors=[];page.on('pageerror',e=>errors.push(e.message))
  await page.setContent(html)
  await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark)
  await page.getByRole('button',{name:'Review payment',exact:true}).click()
  const sheet=page.getByRole('dialog',{name:'Confirm payment',exact:true})
  await sheet.waitFor()
  assert.equal(await page.evaluate(()=>window.sends),0)
  const box=await sheet.boundingBox()
  assert.ok(box && box.width<=512 && box.x>=0)
  if(width<640) assert.ok(Math.abs(box.y+box.height-844)<2,'mobile sheet reaches screen bottom')
  else assert.ok(Math.abs(box.y+box.height/2-422)<2,'desktop card is vertically centred')
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
  await page.keyboard.press('Escape')
  assert.equal(await sheet.count(),0)
  await page.getByRole('button',{name:'Review payment',exact:true}).click()
  const stem='output/playwright/browser-checkout-'+width+(dark?'-dark':'-light')
  await page.screenshot({path:stem+'-review.png'})
  const confirm=sheet.getByRole('button',{name:'Confirm payment',exact:true})
  await confirm.focus();await page.keyboard.press('Enter')
  await page.getByRole('heading',{name:'Processing',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.sends),1)
  assert.equal(await page.getByRole('link',{name:'Return to merchant'}).count(),0)
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('dialog',{name:'Payment status'}).count(),1)
  await page.screenshot({path:stem+'-processing.png'})
  await page.getByRole('button',{name:'Check payment status'}).click()
  await page.getByRole('heading',{name:'Successful',exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>window.sends),1,'status check never resends payment')
  assert.equal(await page.getByRole('link',{name:'Return to merchant'}).getAttribute('href'),'https://merchant.example/receipt')
  await page.screenshot({path:stem+'-success.png'})
  assert.deepEqual(errors,[])
  await page.close()
 }
 console.log('PASS: mobile bottom sheet; desktop centred card; both themes; keyboard review/confirm; close without sending; one submission; pending cannot dismiss or return as paid; status check never resends; no page errors or horizontal overflow.')
} finally {await browser.close()}
