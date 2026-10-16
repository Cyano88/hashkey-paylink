import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE)
const mocks={
 usePocketIdentity:`export default()=>({getAccessToken:async()=> 'fixture'})`,
 usePocketDisplayCurrency:`export default()=> 'USDC'`,
 usePocketFxQuote:`export default()=>({})`,
 PocketFundingAction:`export default({children})=>children`,
 PocketArcTokenPicker:`import React from 'react';export default()=> <button>USDT</button>`,
 PocketTransactionSheet:`import React from 'react';export default({state,onDone})=><div role="dialog" aria-label="Outcome">{state}<button onClick={onDone}>Done</button></div>`,
 pocketReceipt:`export const pocketActivityReceipt=()=>null`,
 pocketPaymentApproval:`export const preparePocketPaymentApproval=async()=>{},takePocketPaymentApproval=()=>true,requestPocketPaymentApproval=async()=>{},POCKET_PAYMENT_APPROVAL_CANCELLED_EVENT='cancel'`,
}
const entry=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Send from './src/pocket/components/PocketStockWalletActions';
window.prepares=0;window.sends=0;
const wallet={address:'0x'+'1'.repeat(40),ready:true,attempts:[],snapshot:{cash:3000000n,usdt:3000000n,gas:0n,holdings:[],complete:true},prepareTransfer:async(asset,recipient,amount)=>{window.prepares++;if(window.prepares===1)throw Error('Could not check the network fee. Review the transfer again.');return {asset,recipient,amount,expiresAt:Date.now()+60000,reimbursement:{feeUnits:'10000',totalUnits:'1010000'}}},send:async()=>{window.sends++;throw Error('Fixture rejected before broadcast')},refresh:async()=>{}};
createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/send?asset=USDT']}><main className="flex h-full min-h-0 flex-col gap-3"><h1>Send</h1><Send wallet={wallet} view="send" stablecoinsOnly/></main></MemoryRouter>);`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>{const k=a.path.split('/').at(-1);if(mocks[k])return{path:k,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'tsx',resolveDir:process.cwd()}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
try{
for(const viewport of [{width:426,height:952},{width:320,height:640},{width:952,height:426}])for(const dark of [false,true]){
 const p=await browser.newPage({viewport});const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await p.goto('https://send.fixture');await p.addStyleTag({content:css+'\n:root{--pocket-safe-top:68px;--pocket-safe-bottom:36px}body{margin:0}#root{height:100dvh;padding:68px 16px 48px;box-sizing:border-box}'});await p.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await p.addScriptTag({content:bundle.outputFiles[0].text});
 const amount=p.getByPlaceholder('0.00');assert.equal(await amount.getAttribute('inputmode'),'none');assert.equal(await amount.getAttribute('readonly'),'');
 await p.getByRole('group',{name:'Amount keypad'}).getByRole('button',{name:'1',exact:true}).click();assert.equal(await amount.inputValue(),'1');
 const last=p.getByRole('button',{name:'Delete digit'});await last.scrollIntoViewIfNeeded();const box=await last.boundingBox();assert(box.y+box.height<=viewport.height-35,'keypad clears gesture area');assert(await p.locator('main').evaluate(e=>e.scrollWidth<=e.clientWidth+1),'no horizontal clipping');
 await p.getByPlaceholder('0x...').fill('0x'+'2'.repeat(40));const cta=p.getByRole('button',{name:'Continue',exact:true});assert.match(await cta.getAttribute('class'),/pocket-cta-primary/);await cta.click();
 const sheet=p.getByRole('dialog',{name:'Confirm send'});await sheet.getByRole('button',{name:'Try again'}).click();await sheet.getByRole('button',{name:'Confirm send',exact:true}).waitFor();assert.equal(await p.evaluate(()=>window.sends),0);assert.equal(await cta.isVisible(),false);assert.equal(await sheet.getByText('Transaction pending',{exact:true}).count(),0);
 await sheet.getByRole('button',{name:'Confirm send',exact:true}).click();await p.getByRole('dialog',{name:'Outcome'}).getByRole('button',{name:'Done'}).click();await cta.waitFor({state:'visible'});assert.equal(await amount.inputValue(),'');assert.equal(await p.getByPlaceholder('0x...').inputValue(),'');assert.deepEqual(errors,[]);await p.close();
}
console.log('PASS X Layer send: shared keypad and themed CTA; Pixel/narrow/landscape light/dark reachability; failed quote retries without sending; no false pending; Done resets form.')
}finally{await browser.close()}
