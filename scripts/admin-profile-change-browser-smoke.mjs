import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {readFile,readdir} from 'node:fs/promises'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Card from './src/components/AdminProfileTypeChange';createRoot(document.getElementById('root')).render(<main className="mx-auto max-w-2xl p-4"><Card projectId="dev_example123" workspaceId="example" onChanged={async()=>{window.changed=true}}/></main>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'auth',setup(b){b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const usePrivy=()=>({getAccessToken:async()=>'fixture'})"}))}}]})
const assets='output/checkout-error-build/assets',css=await readFile(assets+'/'+(await readdir(assets)).find(f=>/^index.*\.css$/.test(f)),'utf8')
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:950}});let changes=0,fail=true
 await page.route('https://admin.test/**',route=>{if(route.request().method()==='POST'){const body=route.request().postDataJSON();if(body.action==='admin-profile-options')return route.fulfill({json:{ok:true,updatedAt:'version-1',profiles:[{id:'business_test123',name:'Example Limited',type:'business',country:'NG',ready:true}]}});changes++;assert.equal(body.confirmPause,true);assert.equal(body.expectedUpdatedAt,'version-1');return route.fulfill({status:fail?409:200,json:fail?{ok:false,error:'This app changed. Reload the profile options before continuing.'}:{ok:true}})}return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text+'</script>'})})
 await page.goto('https://admin.test');await page.getByRole('button',{name:'Change profile type',exact:true}).click()
 const submit=page.getByRole('button',{name:'Change profile and pause payments',exact:true});assert.equal(await submit.isEnabled(),false)
 await page.getByLabel('Destination profile').selectOption('business_test123');await page.getByLabel('Reason',{exact:true}).fill('Builder requested a business profile correction.');assert.equal(await submit.isEnabled(),false)
 await page.getByRole('checkbox').check();await submit.click();await page.getByRole('alert').waitFor();assert.equal(await page.evaluate(()=>window.changed),undefined)
 fail=false;await submit.click();await page.getByRole('status').waitFor();assert.equal(changes,2);assert.equal(await page.evaluate(()=>window.changed),true)
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)
 await page.screenshot({path:`output/playwright/admin-profile-change-${width}.png`});await page.close()
}}finally{await browser.close()}
console.log('PASS Admin profile change mobile/desktop: explicit confirmation, reason, destination, stale error and successful paused result.')
