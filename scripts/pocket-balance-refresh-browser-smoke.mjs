import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const mocks = {
 '../api/pocketReadClient': `export const readPocketBalances=input=>window.enqueue('balance',input);export const readPocketLinkedWallets=input=>window.enqueue('wallets',input);`,
 '../hooks/usePocketIdentity': `export default ()=>({authenticated:true,email:window.owner,getAccessToken:async()=>window.owner})`,
 '../hooks/usePocketActivity': `export default ()=>({resolved:true,rows:[]})`,
 '../hooks/usePocketProfile': `export default ()=>({profile:{displayCurrency:'USD'}})`,
 '../hooks/usePocketFxQuote': `export default ()=>({quote:null,busy:false})`,
}
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Home from './src/pocket/pages/PocketHomePage';import useWallets from './src/pocket/hooks/usePocketWallets';import {pocketBalanceRevision} from './src/pocket/lib/pocketBalanceRevision';
window.calls=[];window.enqueue=(kind,input)=>new Promise((resolve,reject)=>{window.calls.push({kind,input,resolve,reject});input.signal?.addEventListener('abort',()=>reject(new Error('aborted')),{once:true})});window.revision=pocketBalanceRevision;
function Harness(){const wallets=useWallets({authenticated:true,email:window.owner,getAccessToken:async()=>window.owner});window.refresh=wallets.refreshBalances;return <pre id='state' style={{display:'none'}}>{JSON.stringify(wallets)}</pre>}
const root=createRoot(document.getElementById('root'));window.mount=owner=>{window.owner=owner;root.render(<React.StrictMode><MemoryRouter><Home/><Harness/></MemoryRouter></React.StrictMode>)};`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx',resolveDir:process.cwd()}))}}]})
const assets=process.env.POCKET_TEST_ASSETS ?? ['.codex-temp/preparation-build/assets','.codex-temp/evm-replacement-release/.codex-temp/preparation-build/assets'].find(existsSync)
if(!assets) throw new Error('Build Pocket first or set POCKET_TEST_ASSETS.')
const css=readdirSync(assets).filter(name=>name.endsWith('.css')).map(name=>readFileSync(assets+'/'+name,'utf8')).join('\n')
const browser=await chromium.launch({headless:true,channel:'chrome'})
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}), errors=[]
 page.on('pageerror',error=>errors.push(error.message))
 await page.route('https://fixture.invalid/**',route=>route.fulfill({contentType:'text/html',body:'<header data-hashpaylink-top-nav style="position:fixed;top:0;height:80px">Fixture</header><div id="root"></div>'}))
 const boot=async()=>{await page.goto('https://fixture.invalid');await page.addStyleTag({content:css+'\n:root{--pocket-safe-top:0px;--pocket-safe-bottom:0px}'});await page.evaluate(()=>{window.timers=[];const original=window.setTimeout.bind(window);window.setTimeout=(fn,delay,...args)=>{const id=original(fn,delay,...args);window.timers.push({fn,delay,id});return id}});await page.addScriptTag({content:bundle.outputFiles[0].text})}
 const mount=async owner=>{await page.evaluate(owner=>window.mount(owner),owner);await page.waitForFunction(()=>document.getElementById('state'))}
 const state=async()=>JSON.parse(await page.locator('#state').textContent())
 const count=async()=>page.evaluate(()=>window.calls.filter(call=>call.kind==='balance').length)
 const resolve=async(amount,{failure=false,replacement=false,oldRevision=false}={})=>page.evaluate(async({amount,failure,replacement,oldRevision})=>{
  const old={address:'0x'+'a'.repeat(40),walletId:'fixture-base',updatedAt:100}
  const wallet=replacement?{...old,address:'0x'+'b'.repeat(40),updatedAt:101}:old
  const rows=await Promise.all(['base','arbitrum','arc','solana'].map(async key=>({key,label:key,balance:key==='base'?amount:0,status:failure&&key==='base'?'error':'ok',walletRevision:await window.revision(key,key==='base'?(oldRevision?old:wallet):undefined),observedAt:Date.now()})))
  const calls=window.calls.filter(call=>!call.done);for(const call of calls){call.done=true;call.resolve(call.kind==='wallets'?{base:wallet}:{total:amount,totalComplete:!failure,unavailableNetworks:failure?['base']:[],rows})}
 },{amount,failure,replacement,oldRevision})
 await boot();await mount('a@fixture.invalid');await page.waitForFunction(()=>window.calls.length===2)
 assert.equal(await count(),1,'StrictMode and two consumers share one balance request')
 await page.getByRole('status',{name:'Loading balances',exact:true}).waitFor()
 await page.getByRole('status',{name:'Loading base balance',exact:true}).waitFor()
 await resolve(7);await page.waitForFunction(()=>JSON.parse(document.getElementById('state').textContent).displayTotal===7)
 assert.equal((await state()).displayComplete,true)
 // Pull past threshold starts before touchend. Hold >3s to catch the old fake completion.
 await page.locator('[data-pocket-scroller]').evaluate(el=>{
  el.scrollTop=0
  for(const [type,y] of [['touchstart',100],['touchmove',180],['touchmove',200]]){const event=new Event(type,{bubbles:true});Object.defineProperty(event,'touches',{value:[{clientY:y}]});el.dispatchEvent(event)}
 })
 await page.getByRole('status',{name:'Refreshing Pocket',exact:true}).waitFor();await page.waitForFunction(()=>window.calls.length===4)
 assert.equal(await count(),2)
 assert.equal(await page.evaluate(()=>window.calls.findLast(call=>call.kind==='balance').input.fresh),true)
 const ring=await page.getByRole('status',{name:'Refreshing Pocket',exact:true}).locator(':scope > span').boundingBox();assert(ring.width>=44&&ring.height>=44)
 await page.waitForTimeout(3_100);assert.equal(await page.getByRole('status',{name:'Refreshing Pocket',exact:true}).isVisible(),true)
 assert.equal((await state()).displayTotal,7,'last known value remains during refresh')
 await resolve(0,{failure:true});await page.waitForFunction(()=>!JSON.parse(document.getElementById('state').textContent).balanceBusy)
 assert.equal((await state()).displayTotal,7);assert.equal((await state()).rows[0].balance,0)
 assert.equal((await state()).displayRows[0].stale,true)
 await page.getByRole('button',{name:'Retry balance refresh',exact:true}).waitFor()
 // Automatic retry observes a synthetic confirmed deposit; no user refresh call.
 await page.evaluate(()=>window.timers.filter(timer=>timer.delay===15_000).at(-1).fn())
 await page.waitForFunction(()=>window.calls.length===6);await resolve(9)
 await page.waitForFunction(()=>JSON.parse(document.getElementById('state').textContent).displayTotal===9)
 const before=await count()
 await page.evaluate(()=>{Object.defineProperty(document,'visibilityState',{configurable:true,value:'hidden'});window.timers.filter(timer=>timer.delay===45_000).at(-1).fn()})
 assert.equal(await count(),before,'hidden app must not poll RPCs')
 await boot();await mount('a@fixture.invalid');await page.waitForFunction(()=>window.calls.length===2)
 assert.equal((await state()).displayTotal,9,'saved balance restores before any network response')
 assert.equal((await state()).totalComplete,false,'restored display is not marked fresh')
 // Current linked wallet changed while an old balance response is outstanding.
 await resolve(9,{replacement:true,oldRevision:true});await page.waitForFunction(()=>!JSON.parse(document.getElementById('state').textContent).balanceBusy)
 assert.equal((await state()).displayRows[0].known,false)
 await page.getByRole('status',{name:'Loading base balance',exact:true}).waitFor()
 await mount('b@fixture.invalid');await page.waitForFunction(()=>window.calls.length===4)
 assert.equal((await state()).displayRows.length,0,'another account never sees saved balances')
 await resolve(0);await page.waitForFunction(()=>JSON.parse(document.getElementById('state').textContent).displayComplete)
 assert.equal((await state()).displayTotal,0,'verified zero replaces shimmer')
 assert.deepEqual(errors,[])
 console.log('PASS: cold shimmer, saved balance during failure/reload, automatic deposit update, wallet-change safety, owner isolation, hidden-tab RPC pause, single-flight StrictMode and larger pull ring awaiting real completion.')
} finally {await browser.close()}
