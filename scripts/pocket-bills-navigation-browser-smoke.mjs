import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright')
const mocks={
 '../hooks/usePocketIdentity':`export default ()=>({authenticated:false,email:'',getAccessToken:async()=>null})`,
 '../hooks/usePocketWallets':`export default ()=>{window.walletReads++;return {resolved:true,wallets:{},rows:[],setWallets:()=>{},refreshBalances:async()=>{},setError:()=>{}}}`,
 '../controllers/usePocketBillsController':`export default ()=>({status:'idle'})`,
 '../controllers/usePocketPaymentLiquidityController':`export default ()=>({status:'idle'})`,
 '../controllers/usePocketWalletController':`export default ()=>({})`,
 '../features/bills/PocketBillsPanel':`export default ({view})=><div data-flow={view}>Fixture {view} flow</div>`,
}
const entry=`import React from'react';import{createRoot}from'react-dom/client';import{MemoryRouter,useLocation,useNavigate}from'react-router-dom';import Page from'./src/pocket/pages/PocketBillsPage';import{resolvePocketRoute,pocketPathFor}from'./src/pocket/lib/pocketRoutes';window.walletReads=0;function App(){const location=useLocation();window.go=useNavigate();const route=resolvePocketRoute(location.pathname.replace(/^\\/pocket/,''));return <><output id='route'>{location.pathname}</output><Page view={route?.section==='bills'?route.view:'overview'}/></>}createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/pocket/bills']}><App/></MemoryRouter>)`
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',define:{'import.meta.env.DEV':'false'},jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],resolveDir:process.cwd(),loader:'jsx'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',r=>r.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));await page.goto('https://fixture.invalid');await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByRole('region',{name:'Bill services'}).waitFor();assert.equal(await page.evaluate(()=>window.walletReads),0,'list does not initialize payment or wallet controllers')
 for(const [label,view]of[['Airtime','airtime'],['Data','data'],['TV','tv'],['Electricity','electricity']]){
  await page.getByRole('button',{name:label,exact:true}).click();await page.locator(`[data-flow="${view}"]`).waitFor()
  assert.equal(await page.locator('#route').textContent(),'/pocket/bills/'+view)
  await page.getByRole('heading',{name:label,exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Back',exact:true}).count(),1)
  await page.getByRole('button',{name:'Back',exact:true}).click();await page.getByRole('region',{name:'Bill services'}).waitFor()
 }
 await page.evaluate(()=>window.go('/pocket/bills/tv'));await page.locator('[data-flow="tv"]').waitFor()
 await page.getByRole('button',{name:'Bills',exact:true}).click();await page.getByRole('region',{name:'Bill services'}).waitFor()
 assert.deepEqual(errors,[]);console.log('PASS Bills list, all four flows, existing Back CTA, direct flow URLs and bottom navigation; list performs no wallet work.')
}finally{await browser.close()}
