import assert from 'node:assert/strict'
import fs from 'node:fs'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const mocks={
 usePocketIdentity:`const getAccessToken=async()=>'fixture';export default()=>({authenticated:true,email:'fixture@example.invalid',getAccessToken})`,
 usePocketWallets:`const setWallets=()=>{},refreshBalances=async()=>{};export default()=>({setWallets,refreshBalances,wallets:{base:{address:'0x1111111111111111111111111111111111111111'}}})`,
 usePocketWalletController:`export default()=>({ensureWallet:async()=>({address:'0x1111111111111111111111111111111111111111'}),getEvmSession:async()=>({userToken:'fixture-session'})})`,
 circleEvmEmailWallet:`export const readCirclePaymentFeeQuote=async input=>{if(input.purpose!=='wallet-send'||input.feeMode!=='gross'||input.amount!=='5.0125')throw Error('Wrong quote');return {token:'signed-fixture-'+input.asset}}`,
 pocketEvmTransferClient:`export const executePocketEvmTransfer=async input=>{window.transfers=(window.transfers||0)+1;if(input.asset!=='USDT'||input.amount!=='5.0125'||input.feeQuoteToken!=='signed-fixture-USDT')throw Error('Wrong transfer');return {txHash:'0x'+'a'.repeat(64),status:'submitted'}}`,
 PocketSlideAction:`export default p=><button className="pocket-cta-primary w-full" disabled={p.disabled} onClick={p.onConfirm}>Confirm payment</button>`,
 UnifiedReceipt:`export const FullScreenReceiptSurface=()=>null`,
 pocketActivityCache:`export const markPocketActivityDirty=()=>{}`,
}
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Checkout from './src/pocket/components/PocketEsimCheckout';createRoot(document.getElementById('root')).render(<Checkout plan={{id:'P',data:'1 GB',days:7}} days={7} onClose={()=>{}}/>);`,resolveDir:process.cwd(),loader:'tsx'},jsx:'automatic',bundle:true,write:false,define:{'import.meta.env':'{}'},plugins:[{name:'boundaries',setup(b){b.onResolve({filter:new RegExp('('+Object.keys(mocks).join('|')+')$')},a=>({path:a.path.split('/').pop(),namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],resolveDir:process.cwd(),loader:'tsx'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage({viewport:{width:393,height:852}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let latest,finished=false,prepares=0
 await page.route('**/api/pocket/esim/orders',async r=>{
  const body=r.request().postDataJSON()
  if(body.action==='quote')latest={id:'esim_fixture',state:'quoted',asset:body.asset,network:'base',packageCode:'P',packageLabel:'1 GB Â· Nigeria',createdAt:Date.now(),expiresAt:Date.now()+120000,price:{subtotal:'5',platformFee:'0.0125',total:'5.0125'},txHash:''}
  if(body.action==='fees'){assert.equal(body.feeQuoteToken,'signed-fixture-'+latest.asset);latest={...latest,networkFee:'0.0075',totalDebit:'5.02'}}
  if(body.action==='prepare'){prepares++;latest={...latest,state:'awaiting_payment'}}
  if(body.action==='status')latest={...latest,state:finished?'ready':'provisioning'}
  await r.fulfill({contentType:'application/json',body:JSON.stringify({intent:latest,recipient:'0x2222222222222222222222222222222222222222',payment:{payer:'0x1111111111111111111111111111111111111111',recipient:'0x2222222222222222222222222222222222222222',asset:latest.asset,network:'base',amount:'5.0125',totalDebit:'5.02',feeQuoteToken:'signed-fixture-'+latest.asset,idempotencyKey:'fixture'}})})
 })
 await page.route('https://fixture.test/',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.test')
 for(const f of fs.readdirSync('dist/assets').filter(f=>f.endsWith('.css')&&f.startsWith('index-')))await page.addStyleTag({content:fs.readFileSync('dist/assets/'+f,'utf8')})
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByText('5.02 USDC',{exact:true}).waitFor()
 await page.getByRole('button',{name:'USDT',exact:true}).click()
 await page.getByText('5.02 USDT',{exact:true}).waitFor();await page.getByText('0.02 USDT',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Confirm payment',exact:true}).click()
 await page.getByRole('heading',{name:'Preparing eSIM',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'eSIM ready'}).count(),0)
 finished=true;await page.getByRole('heading',{name:'eSIM ready',exact:true}).waitFor({timeout:12000})
 assert.equal(prepares,1);assert.equal(await page.evaluate(()=>window.transfers),1);assert.deepEqual(errors,[])
 await page.screenshot({path:'.codex-temp/esim-checkout-ready.png'})
 console.log('PASS USDC/USDT quote selection, combined fee/full debit before approval, one transfer, provisioning then verified-ready sheet')
}finally{await browser.close()}
