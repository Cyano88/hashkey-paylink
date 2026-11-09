import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState} from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import Request from './src/developer/MarketplaceAccessRequest';import Review from './src/developer/MarketplaceAccessReview';import Apps from './src/developer/AdminProductApps';function App(){const[view,setView]=useState('developer');return <BrowserRouter><main className="mx-auto max-w-3xl p-5"><nav className="flex flex-wrap gap-4">{['developer','admin','apps'].map(v=><button onClick={()=>setView(v)} key={v}>{v} view</button>)}</nav>{view==='developer'?<Request projectId="dev_12345678"/>:view==='admin'?<Review/>:<Apps workspaces={[{id:'workspace_a',name:'Workspace A',sections:['products'],integrations:[{id:'app_a',name:'Checkout and funding app',capabilities:['hosted_checkout','polymarket_funding'],status:'active'},{id:'app_b',name:'Marketplace app',capabilities:['marketplace_payments'],status:'active'}]},{id:'hidden',name:'Hidden',sections:[],integrations:[{id:'hidden',name:'Hidden app',capabilities:['marketplace_payments'],status:'active'}]}]}/>}</main></BrowserRouter>}createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'mock-auth',setup(build){build.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'auth'}));build.onLoad({filter:/.*/,namespace:'auth'},()=>({contents:"const getAccessToken=async()=> 'fixture-token';export const usePrivy=()=>({getAccessToken});",loader:'js'}))}}]})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true})
mkdirSync('output/playwright',{recursive:true})
try{for(const width of [320,390,1280]){
 const page=await browser.newPage({viewport:{width,height:900}}),errors=[];let request=null,posts=0
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://marketplace-access.test/**',async route=>{
  const url=new URL(route.request().url())
  if(url.pathname==='/api/marketplace-access'){
   const admin=url.searchParams.get('resource')==='admin'
   if(route.request().method()==='POST'){const body=route.request().postDataJSON();if(admin){request={...request,status:body.status,reviewNote:body.note}}else{posts++;request??={id:'request_a',projectId:'dev_12345678',projectName:'Test Marketplace',email:'builder@example.com',status:'pending',createdAt:new Date(0).toISOString()}}await new Promise(r=>setTimeout(r,100));return route.fulfill({json:{ok:true,request}})}
   return route.fulfill({json:admin?{ok:true,requests:request?[request]:[]}:{ok:true,email:'builder@example.com',request}})
  }
  return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})
 })
 await page.goto('https://marketplace-access.test/')
 await page.getByRole('button',{name:'Request whitelist access'}).click()
 await page.getByText('Request received - pending review',{exact:true}).waitFor();assert.equal(posts,1)
 await page.reload();await page.getByText('Request received - pending review',{exact:true}).waitFor();assert.equal(posts,1)
 await page.getByRole('button',{name:'admin view',exact:true}).click()
 await page.getByRole('textbox',{name:'Review note'}).fill('Approved for staged rollout')
 await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByText('Whitelist request approved.',{exact:true}).waitFor()
 await page.getByRole('combobox',{name:'Request status'}).selectOption('approved')
 await page.getByRole('button',{name:'Revoke approval',exact:true}).waitFor()
 await page.getByRole('button',{name:'developer view',exact:true}).click();await page.getByText('Whitelist approved',{exact:true}).waitFor()
 await page.getByRole('button',{name:'admin view',exact:true}).click();await page.getByRole('combobox',{name:'Request status'}).selectOption('approved')
 await page.getByRole('button',{name:'Revoke approval',exact:true}).click();await page.getByText('Whitelist request rejected.',{exact:true}).waitFor()
 await page.getByRole('button',{name:'developer view',exact:true}).click();await page.getByText('Request not approved',{exact:true}).waitFor()
 await page.getByRole('button',{name:'apps view',exact:true}).click()
 for(const name of ['Checkout apps','Polymarket Funding apps','Marketplace apps'])await page.getByRole('region',{name,exact:true}).waitFor()
 assert.equal(await page.getByRole('heading',{name:'Checkout and funding app',exact:true}).count(),2)
 assert.equal(await page.getByText('Hidden app',{exact:true}).count(),0)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 await page.screenshot({path:'output/playwright/marketplace-admin-apps-'+width+'.png',fullPage:true})
 assert.deepEqual(errors,[]);await page.close()
}console.log('PASS portal/admin browser: request/reload, approve/revoke reflected to developer, review notes, product grouping, hidden workspace exclusion and no overflow at 320/390/1280. Mock identity/API; no live requests submitted.')}finally{await browser.close()}
