import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const contents=`
import {sendCircleEvmEmailPayment} from './src/lib/circleEvmEmailWallet';
import {setPocketPaymentApproval} from './src/pocket/lib/pocketPaymentApproval';
window.headers=[];window.bodies=[];
window.fetch=async(url,init)=>{window.headers.push(init.headers);window.bodies.push(JSON.parse(init.body));return window.mismatch ? Response.json({ok:true,challengeId:'fixture-challenge',approval:{asset:'USDC',amount:'0.01',total:'0.02'}}) : new Response(JSON.stringify({ok:false,error:'fixture stops before signing'}),{status:400})};
window.approve=(expires)=>setPocketPaymentApproval('fixture-approval',expires,'Bearer fixture-owner');
window.send=(asset='USDC',chain='base')=>sendCircleEvmEmailPayment({asset,session:{chain,userToken:'fixture',encryptionKey:'fixture',appId:'fixture',wallet:{id:'wallet',address:'0x'+'2'.repeat(40)}},recipient:'0x'+'3'.repeat(40),amount:'0.01',feeQuoteToken:'fixture',privyAccessToken:'fixture-session'}).catch(e=>e.message);
`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',define:{'process.env.NODE_ENV':'"test"','import.meta.env':'{}'},plugins:[{name:'sdk-fixture',setup(b){
 b.onResolve({filter:/^@circle-fin\/w3s-pw-web-sdk$/},()=>({path:'sdk',namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export class W3SSdk {messageHandler(){} setAuthentication(){} setThemeColor(){} setResources(){} setCustomLinks(){} setLocalizations(){} }'}))
}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage()
 await page.route('https://checkout.invalid/pay?checkout=chk_fixture',r=>r.fulfill({contentType:'text/html',body:'<main>Approval test</main>'}))
 await page.goto('https://checkout.invalid/pay?checkout=chk_fixture')
 await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.evaluate(()=>window.approve(Date.now()+60000))
 assert.match(await page.evaluate(()=>window.send()),/fixture stops before signing/)
 const first=await page.evaluate(()=>window.headers[0])
 assert.equal(first['X-Pocket-Payment-Approval'],'fixture-approval','Hosted browser must send the approved proof')
 assert.equal(first.Authorization,'Bearer fixture-owner','Proof retains its authenticated owner')
 assert.equal(first['X-Pocket-Client'],undefined,'Web checkout does not claim to be the native Pocket client')
 await page.evaluate(()=>window.send())
 assert.equal(await page.evaluate(()=>window.headers[1]['X-Pocket-Payment-Approval']),undefined,'Approval is single use')
 await page.evaluate(()=>{window.approve(Date.now()-1);return window.send()})
 assert.equal(await page.evaluate(()=>window.headers[2]['X-Pocket-Payment-Approval']),undefined,'Expired approval is not sent')
 for(const chain of ['base','arbitrum','ethereum','polygon']) {
  await page.evaluate(chain=>window.send('USDT',chain),chain)
  const body=await page.evaluate(()=>window.bodies.at(-1))
  assert.equal(body.asset,'USDT');assert.equal(body.chain,chain);assert.equal(body.totalUnits,'10000')
 }
 await page.evaluate(()=>{window.mismatch=true})
 assert.match(await page.evaluate(()=>window.send('USDT','base')),/approval asset does not match/)
 await page.evaluate(()=>{window.mismatch=false})
 const count=await page.evaluate(()=>window.bodies.length)
 assert.match(await page.evaluate(()=>window.send('USDT','arc')),/not supported/)
 assert.equal(await page.evaluate(()=>window.bodies.length),count)
 console.log('PASS USDT client payload binds asset and chain; unsupported Arc USDT never requests approval.')
 console.log('PASS hosted Circle browser: owner-bound approval header, single use, expired proof rejection; no live signing or funds.')
}finally{await browser.close()}
