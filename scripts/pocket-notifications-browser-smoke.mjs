import assert from 'node:assert/strict'
import { build } from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/81fb41e6b6793dc6/node_modules/playwright/index.mjs')
const mock=`export default ()=>({authenticated:true,email:window.owner,getAccessToken:async()=>window.owner})`
const bundle=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import{MemoryRouter}from'react-router-dom';import Page from './src/pocket/pages/PocketNotificationsPage';import Badge from './src/pocket/components/PocketNotificationButton';window.owner='one';const root=createRoot(document.getElementById('root'));window.mount=()=>root.render(<React.StrictMode><MemoryRouter><Page/><Badge/></MemoryRouter></React.StrictMode>);window.mount()`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'identity',setup(b){b.onResolve({filter:/hooks\/usePocketIdentity$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:mock,loader:'js'}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage(),errors=[];let gets=0,posts=0,mode='empty'
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/*',async route=>{
  if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'})
  if(route.request().method()==='POST'){posts++;return route.fulfill({status:429,json:{ok:false,error:'Too many requests.'},headers:{'Retry-After':'60'}})}
  gets++
  await route.fulfill({json:{ok:true,unreadCount:mode==='unread'?1:0,requests:mode==='empty'?[]:[{id:'fixture',title:'Fixture notification',direction:'incoming',senderName:'Fixture',amount:'1',status:'pending',createdAt:1}]}})
 })
 await page.goto('https://fixture.invalid');await page.addScriptTag({content:bundle.outputFiles[0].text})
 await page.getByText('No notifications yet',{exact:true}).waitFor();assert.equal(gets,1);assert.equal(posts,0)
 for(let i=0;i<5;i++)await page.evaluate(()=>{window.mount();window.dispatchEvent(new Event('focus'));window.dispatchEvent(new Event('pocket:requests-updated'))})
 await page.waitForTimeout(300);assert.equal(gets,1,'unstable token callback and repeated events do not storm');assert.equal(posts,0)
 mode='unread';await page.evaluate(()=>{window.owner='two';window.mount()})
 await page.getByText('Fixture notification',{exact:true}).waitFor();await page.waitForTimeout(300)
 assert.equal(gets,2);assert.equal(posts,1);assert.equal(await page.getByText('Notifications could not load',{exact:true}).count(),0,'mark-read 429 must not hide loaded items')
 await page.evaluate(()=>{for(let i=0;i<10;i++)window.dispatchEvent(new Event('focus'))});await page.waitForTimeout(200);assert.equal(gets,2,'server cooldown is respected')
 assert.deepEqual(errors,[]);console.log('PASS notification StrictMode, render/event deduplication, empty inbox without writes, account switch and read-receipt failure.')
}finally{await browser.close()}
