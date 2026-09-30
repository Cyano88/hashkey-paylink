import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright')
const stubs={
 usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@test',getAccessToken:window.getToken});`,
 usePocketWallets:`export default()=>({resolved:true,rows:[{key:'base',balance:10}],wallets:{base:{address:'0x111'}},setWallets:()=>{},refreshBalances:async()=>{},setError:()=>{}});`,
 usePocketActivity:`export default()=>({refresh:async()=>{}});`,
 usePocketWalletController:`export default()=>({});`,
 usePocketPaymentLiquidityController:`export default()=>({});`,
 usePocketWithdrawalController:`import{useState}from'react';export default()=>{const [amount,setAmount]=useState('1'),[address,setAddress]=useState('0x222'),[status,setStatus]=useState('idle'),[feePreview,setFee]=useState(null),[error,setError]=useState('');return {amount,address,status,feePreview,error,setAmount,setAddress,setMax:()=>{},reference:status==='successful'?'0xhash':'',txHash:status==='successful'?'0xhash':'',prepare:()=>new Promise(resolve=>window.finishPrepare=()=>{setFee({platform:'0.0025',network:'0.001',total:'1.0035'});resolve()}),withdraw:()=>{window.submissions++;setStatus('pending');return new Promise(resolve=>window.finishSend=state=>{setStatus(state);if(state==='idle')setError('Transfer rejected');resolve(state==='successful')})},reset:()=>{setStatus('idle');setAmount('');setAddress('');setError('')}}};`,
 pocketRequestsClient:`export const preparePocketRequestPayment=async()=>{},completePocketRequest=async()=>{},readPocketRequestRoute=async()=>{},reconcilePocketRequest=async()=>{},readPocketRequests=async()=>[],resolvePocketRecipient=async(token,id,network)=>{window.lookups++;return {pocketId:id,network,name:'Person '+id,address:'0x'+id.padEnd(40,'0')}},startPocketRequestRoute=async()=>{},updatePocketRequestRoute=async()=>{};`,
 pocketPaymentApproval:`export const POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='cancel';export const preparePocketPaymentApproval=async()=>{};export const requestPocketPaymentApproval=()=>new Promise(resolve=>window.finishPin=resolve);`,
 PocketRouteShell:`import React from'react';export default({children})=><main>{children}</main>;`,
 PocketFlowHeader:`import React from'react';export default({title})=><h1>{title}</h1>;`,
 PocketSelect:`import React from'react';export default()=>null;`,
 PocketTransactionSheet:`import React from'react';export default({title,state,detail,onDone})=><div role="dialog" aria-label="Outcome">{title}:{state}{detail}<button onClick={onDone}>Done</button></div>;`,
 pocketReceipt:`export const pocketActivityReceipt=()=>null;`,
}
const bundle=await build({stdin:{contents:`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Send from'./src/pocket/pages/PocketSendPage';window.getToken=async()=> 'fixture';window.lookups=0;window.submissions=0;createRoot(document.getElementById('app')).render(<MemoryRouter initialEntries={['/send?mode=pocket']}><Send/></MemoryRouter>)`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const k=a.path.split('/').at(-1);if(stubs[k])return{path:k,namespace:'stub'}});b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage()
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="app"></div>'}))
 await page.goto('https://pocket.test');await page.addScriptTag({content:bundle.outputFiles[0].text})
 const id=page.getByPlaceholder('Enter 6 to 12 digits'), next=page.getByRole('button',{name:'Continue',exact:true})
 await id.fill('123456');await page.getByText('Person 123456',{exact:true}).waitFor();assert.equal(await next.isEnabled(),true)
 await id.fill('654321');assert.equal(await next.isDisabled(),true,'Old recipient cannot be used during debounce')
 assert.equal(await page.getByText('Person 123456',{exact:true}).count(),0)
 await page.getByText('Person 654321',{exact:true}).waitFor();assert.equal(await next.isEnabled(),true)
 await id.fill('12');assert.equal(await next.isDisabled(),true);assert.equal(await page.getByText('Person 654321',{exact:true}).count(),0)
 console.log('PASS Pocket ID changes immediately invalidate the previous recipient; invalid IDs clear lookup state.')
}finally{await browser.close()}
