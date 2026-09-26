import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {createServer} from 'node:http'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 usePocketIdentity:`export default ()=>({user:{id:'payer'},getAccessToken:async()=>''})`,
 'react-router-dom':`export const useLocation=()=>({pathname:'/xstocks/xpay'}),useNavigate=()=>()=>{},useSearchParams=()=>[new URLSearchParams('merchant=merchant')];`,
 usePocketSlowConfirmation:`export default ()=>false`,
 PocketBottomSheet:`export default p=>p.children`,
 PocketGetApp:`export default ()=>null`,PocketXPayLinks:`export default ()=>null`,PocketPaymentSuccess:`export default ()=>null`,
 UnifiedReceipt:`export const FullScreenReceiptSurface=()=>null`,
 PocketIcons:`export const CheckCircle2=()=>null,Clock3=()=>null,Search=()=>null`,
 PocketArcTokenPicker:`export default ()=>null`,
 pocketStockPickerTokens:`export const stockPickerTokens=()=>[]`,
 pocketStockDisplay:`export const formatStockQuantity=String`,
 pocketRail:`export const xStockPath=s=>s`,
 pocketXStocksWallet:`export const stockAssets=[{address:'token',symbol:'NVDAx'}],stockQuantity=String;export const prepareStockTransfer=async(owner,asset,recipient,amount)=>({owner,asset,recipient,amount,fee:BigInt(window.fee),expiresAt:Date.now()+60000})`,
 pocketXPayClient:`export const xpayRequest=async(_,b)=>{if(b.action==='merchant')return {merchant:{id:'merchant',name:'Test shop',tokens:['token']}};if(b.action==='prepare'){window.prepares++;return {payment:{id:'p'+window.prepares,merchantName:'Test shop',token:'token',recipient:'seller',amount:'0.002',usd:b.usd,status:'ready',expiresAt:Date.now()+300000}}}if(b.action==='authorize'){window.authorizes++;return {payment:{id:b.id,status:'submitted'}}}if(b.action==='confirm')return {payment:{id:b.id,status:'paid'}};throw Error(b.action)}`
}
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import XPay from './src/pocket/components/PocketXPay';window.prepares=0;window.authorizes=0;window.sends=0;window.fee=100;window.clock=1000000;Date.now=()=>window.clock;const wallet={address:'payer',refresh:async()=>{},send:async(r,h)=>{window.sends++;await h.beforeSubmit();throw Error('fixture stopped before signing')}};createRoot(document.getElementById('root')).render(<XPay wallet={wallet}/>);`
const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=mocks[a.path]?a.path:a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const server=createServer((req,res)=>res.end('<div id="root"></div>'));await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByRole('textbox',{name:'Amount in USD'}).fill('0.50');await page.getByRole('button',{name:'Continue',exact:true}).click();await page.getByRole('button',{name:'Pay Test shop'}).waitFor();
 await page.evaluate(()=>window.clock+=300000);await page.getByRole('button',{name:'Update payment amount'}).waitFor();assert.equal(await page.evaluate(()=>window.sends),0);
 await page.getByRole('button',{name:'Update payment amount'}).click();await page.getByRole('button',{name:'Pay Test shop'}).waitFor();assert.equal(await page.evaluate(()=>window.prepares),2);assert.equal(await page.evaluate(()=>window.sends),0);
 await page.evaluate(()=>{window.clock+=61000;window.fee=150});await page.getByRole('button',{name:'Pay Test shop'}).click();await page.getByRole('alert').filter({hasText:'Network fee changed'}).waitFor();assert.equal(await page.evaluate(()=>window.sends),0);
 await page.getByRole('button',{name:'Pay Test shop'}).click();await page.getByRole('alert').filter({hasText:'fixture stopped'}).waitFor();assert.equal(await page.evaluate(()=>window.authorizes),1);
 console.log('PASS expired review updates without PIN/send; refreshed amount requires separate Pay; higher fee requires review; same reviewed transfer authorizes once');
}finally{await browser.close();server.close()}
