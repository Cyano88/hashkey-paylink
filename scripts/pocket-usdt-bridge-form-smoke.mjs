import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Panel from './src/pocket/components/PocketUsdtBridgePanel';
window.requests=[];window.fail=false;window.listCalls=0;
window.fetch=async(url,options)=>{const body=options?.body?JSON.parse(options.body):null;if(!body){window.listCalls++;if(window.listCalls<3)return new Response('<!DOCTYPE html>',{status:502});return new Response(JSON.stringify({ok:true,pending:[],solanaDestinationEnabled:true,solanaSourceEnabled:true}))}window.requests.push(body);if(window.failNextQuote){window.failNextQuote=false;return new Response('<!DOCTYPE html>',{status:502})}if(body.action==='status'&&window.failStatusOnce){window.failStatusOnce=false;throw Error('Network error')}if((body.action==='status'||body.action==='resume')&&window.pendingApproval){if(body.action==='status')await new Promise(r=>setTimeout(r,1500));return new Response(JSON.stringify({ok:true,status:window.hashDuringCheck?'pending':'awaiting_approval',...(window.hashDuringCheck?{txHash:'0x'+'a'.repeat(64)}:{}),challengeId:'saved-approval'}))}if(body.action==='execute')return new Response(JSON.stringify({ok:true,transaction:'fixture',bridgeId:'fixture'}));if(body.action==='status'&&window.requireCircleSession&&!body.circleUserToken)return new Response(JSON.stringify({ok:true,status:'pending',requiresWalletSession:true}));if(body.action==='status')return new Response(JSON.stringify({ok:true,status:'not_submitted',...(window.expiredApproval?{reason:'approval_expired'}:{})}));if(body.action!=='quote')throw Error('No transaction allowed in fixture');if(window.fail)return new Response(JSON.stringify({ok:false,error:'Quote unavailable'}),{status:503});await new Promise(r=>setTimeout(r,body.amount==='1'?800:20));return new Response(JSON.stringify({ok:true,quoteToken:'fixture',sufficientBalance:Number(body.amount)<=8,quote:{id:body.amount+'-'+Date.now(),source:body.source,destination:body.destination,walletAddress:'0x'+'1'.repeat(40),amount:body.amount,receive:String(Number(body.amount)-.01),minimumReceive:String(Number(body.amount)-.02),fee:window.highFee?'.22':'.01',networkFeeUnits:'3000',total:String(Number(body.amount)+.003),expiresAt:Date.now()+2000}}))};
createRoot(document.getElementById('root')).render(<MemoryRouter><Panel owner='form-fixture' getAccessToken={async()=> 'fixture'} ensureWallet={async()=>({address:'0x'+'1'.repeat(40)})} getSession={async()=>({userToken:'circle-fixture'})} getSolanaSession={async()=>({userToken:'sol-fixture',wallet:{address:'fixture'}})} balances={[{key:'arbitrum',usdt:8}]} refresh={async()=>{}} onActivity={()=>{}} onBusyChange={()=>{}}/></MemoryRouter>);`
const mocks={circleSolanaEmailWallet:"export const signCircleSolanaTransaction=async()=>{throw Error('No live signing')}",usePocketIdentity:`export default()=>({authenticated:true,email:'fixture@test',getAccessToken:async()=>null})`,usePocketWallets:`export default()=>({resolved:true,wallets:{},setWallets:()=>{}})`,usePocketWalletController:`export default()=>({ensureWallet:async()=>{throw Error('No live wallet')}})`,PocketNetworkBalance:`import React from 'react';export default({asset='USDC',network})=><span data-balance-asset={asset}>{network} {asset} local equivalent</span>`,PocketRouteShell:`export default({children})=>children`,circleEvmEmailWallet:`export const executeCircleEvmEmailChallenge=async()=>{window.approvals=(window.approvals||0)+1;throw Error('Network error')}`}
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').pop();return mocks[key]?{path:key,namespace:'fixture'}:undefined});b.onLoad({filter:/.*/,namespace:'fixture'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{
 const page=await browser.newPage()
 await page.route('https://fixture.test/**',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}))
 await page.goto('https://fixture.test')
 await page.addScriptTag({content:result.outputFiles[0].text})
 await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Review bridge',exact:true}).count(),0)
 await page.waitForFunction(()=>window.listCalls>=3);
 await page.getByRole('button',{name:'Select source network',exact:true}).click()
 await page.getByRole('option',{name:'Solana',exact:false}).waitFor();
 assert.equal(await page.locator('[data-balance-asset="USDT"]').count(),5)
 assert.equal(await page.locator('[data-balance-asset="USDC"]').count(),0)
 await page.getByRole('option',{name:'Arbitrum',exact:false}).click()
 await page.waitForFunction(()=>window.listCalls>=3);
 await page.getByRole('button',{name:'Select destination network',exact:true}).click()
 await page.getByRole('option',{name:'Solana',exact:false}).waitFor();
 assert.equal(await page.locator('[data-balance-asset="USDT"]').count(),4)
 await page.getByRole('option',{name:'Base',exact:false}).click()
 const input=page.getByLabel('USDT bridge amount');const fillAmount=async(value)=>{await input.press('ControlOrMeta+A');await input.press('Backspace');await input.pressSequentially(value)};assert.equal(await input.isEnabled(),true);assert.equal(await page.getByRole('alert').count(),0)
 await fillAmount('1')
 await page.waitForFunction(()=>window.requests.some(r=>r.amount==='1'))
 assert.equal(await input.isEnabled(),true)
 await fillAmount('2')
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.waitForTimeout(900)
 assert.match(await page.locator('body').innerText(),/1\.99\s+USDT/)
 assert.doesNotMatch(await page.locator('body').innerText(),/0\.99\s+USDT/)
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>window.fixtureHidden?'hidden':'visible'});window.fixtureHidden=true;document.dispatchEvent(new Event('visibilitychange'))})
 const hiddenRequests=await page.evaluate(()=>window.requests.length)
 await page.waitForTimeout(2300)
 assert.equal(await page.evaluate(()=>window.requests.length),hiddenRequests)
 await page.evaluate(()=>{window.fixtureHidden=false;document.dispatchEvent(new Event('visibilitychange'))})
 await page.waitForFunction(n=>window.requests.length>n,hiddenRequests)
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 const before=await page.evaluate(()=>window.requests.length)
 await page.waitForFunction(n=>window.requests.length>n,before)
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.getByRole('button',{name:'Max',exact:true}).click()
 assert.equal(await input.inputValue(),'7.997')
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 await page.evaluate(()=>window.failNextQuote=true);await fillAmount('4');await page.waitForFunction(()=>window.requests.filter(r=>r.amount==='4').length>=2);await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0);
 await fillAmount('9')
 await page.getByRole('button',{name:'Add funds',exact:true}).waitFor()
 await page.waitForTimeout(600)
 assert.equal(await page.evaluate(()=>window.requests.some(r=>r.amount==='9')),false,'An amount above a fresh balance must not request fee estimation')
 assert.equal(await page.getByText('Insufficient funds',{exact:true}).count(),1)
 assert.equal(await input.evaluate(el=>el.parentElement.textContent.includes('Insufficient funds')),true,'The balance hint belongs beneath the amount')
 assert.equal(await page.getByRole('alert').count(),0)
 await page.evaluate(()=>window.fail=true)
 await fillAmount('3')
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor()
 await page.evaluate(()=>window.fail=false)
 await page.getByRole('button',{name:'Try again',exact:true}).click()
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.requests.every(r=>r.action==='quote'&&r.circleUserToken==='circle-fixture')),true)
 assert.equal(await page.getByText('Total',{exact:true}).count(),1)
 assert.equal(await page.getByText('Fee',{exact:true}).count(),1)
 await page.evaluate(()=>window.highFee=true);await fillAmount('1');await page.getByText('The fee is high for this amount. You can still proceed.',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Confirm bridge',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Select destination network',exact:true}).click();await page.getByRole('option',{name:'Solana',exact:false}).click();await page.waitForFunction(()=>window.requests.some(r=>r.destination==='solana'&&r.source==='arbitrum'));await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Confirm bridge',exact:true}).isEnabled(),true);
 await page.getByRole('button',{name:'Select source network',exact:true}).click();await page.getByRole('option',{name:'Solana',exact:false}).click();await fillAmount('0.5');await page.getByRole('button',{name:'Confirm bridge',exact:true}).click();
 await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor();
 assert.equal(await input.inputValue(),'','An unsigned failed attempt leaves a fresh form');
 assert.equal(await page.evaluate(()=>window.requests.some(r=>r.action==='submit')),false,'Failed signing must never submit');
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pocket:operation:')).map(k=>JSON.parse(localStorage.getItem(k))).some(r=>r.state==='failed')),true);
 await page.goto('https://fixture.test');
 await page.evaluate(()=>localStorage.setItem('pocket:usdt-bridge:v1:form-fixture',JSON.stringify({quoteToken:'saved',challengeId:'saved-approval',awaitingApproval:true,quote:{id:'saved',source:'arbitrum',destination:'base',walletAddress:'0x'+'1'.repeat(40),amount:'16',receive:'15.96',minimumReceive:'15.96',fee:'.09',total:'16.05',expiresAt:Date.now()+60000}})));
 await page.addScriptTag({content:result.outputFiles[0].text});
 await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor();
 assert.equal(await page.getByLabel('USDT bridge amount').inputValue(),'');
 assert.equal(await page.getByLabel('USDT bridge amount').isEnabled(),true);
 assert.equal(await page.evaluate(()=>localStorage.getItem('pocket:usdt-bridge:v1:form-fixture')),null);
 assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('pocket:operation:')).map(k=>JSON.parse(localStorage.getItem(k))).some(r=>r.pending.challengeId==='saved-approval')),true,'Migration retains provider recovery identifiers');
 assert.equal(await page.evaluate(()=>window.requests.some(r=>['status','resume','execute','submit'].includes(r.action))),false,'A new form neither recovers nor signs previous operations');
 await fillAmount('2');
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).waitFor();
 await page.getByRole('button',{name:'Confirm bridge',exact:true}).click();
 await page.getByRole('button',{name:'Enter bridge amount',exact:true}).waitFor();
 assert.equal(await page.getByLabel('USDT bridge amount').isEnabled(),true,'Unknown approval results cannot trap the form');
 assert.equal(await page.evaluate(()=>window.approvals),1,'One explicit confirmation makes one SDK approval');
 console.log('PASS bridge form: fresh forms, durable migration, no auto-signing, quote races, selectors, Max, fee warning, Solana signing failure');
}finally{await browser.close()}
