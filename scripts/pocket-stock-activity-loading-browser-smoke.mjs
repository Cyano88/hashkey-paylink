import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright')
const mocks={
 usePocketIdentity:`export default ()=>({authenticated:true,user:{id:window.owner},getAccessToken:async()=>window.owner})`,
 PocketActivityPanel:`export default p=>{window.panel=p;return null}`,
 pocketStockNotificationsClient:`export const stockNotificationsRequest=async()=>{if(window.failNotices)throw Error('fixture');if(window.emptyNotices)return {notices:[],requests:[]};return {notices:[{id:window.owner,hash:'hash',at:1,transfer:{from:'sender',to:'wallet',direction:'in',amount:'1',symbol:'NVDAx'}}],requests:[]}}`,
 pocketXPayClient:`export const xpayRequest=async()=>{if(window.hangXpay)await new Promise(r=>window.releaseXpay=r);if(window.failXpay)throw Error('fixture');return {payments:[]}}`,
 pocketRefresh:`export const registerPocketRefreshHandler=f=>{window.refresh=f;return()=>{}}`,
}
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import Activity from './src/pocket/components/PocketStockActivity';const root=createRoot(document.getElementById('root'));window.renderActivity=key=>root.render(<Activity key={key} wallet={{address:'wallet'}}/>);window.owner='a';window.hangXpay=true;window.failXpay=true;window.renderActivity(1)`
const result=await build({stdin:{contents,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>{const key=a.path.split('/').at(-1);if(mocks[key])return{path:key,namespace:'mock'}});b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path]}))}}]})
const browser=await chromium.launch({headless:true,channel:'chrome'})
try{
 const page=await browser.newPage();await page.goto('about:blank');await page.setContent('<div id="root"></div>');await page.addScriptTag({content:result.outputFiles[0].text})
 await page.waitForFunction(()=>window.panel?.rows.length===1&&!window.panel.busy)
 assert.equal(await page.evaluate(()=>window.panel.rows[0].eventId),'a')
 await page.evaluate(()=>{window.hangXpay=false;window.releaseXpay()});await page.waitForFunction(()=>!!window.panel.error)
 await page.evaluate(async()=>{window.failNotices=true;await window.refresh()});assert.equal(await page.evaluate(()=>window.panel.rows.length),1)
 await page.evaluate(()=>window.renderActivity(2));await page.waitForFunction(()=>!window.panel.busy);assert.equal(await page.evaluate(()=>window.panel.rows.length),1)
 await page.evaluate(()=>{window.owner='b';window.renderActivity(3)});await page.waitForFunction(()=>window.panel.rows.length===0&&!window.panel.busy)
 assert.match(await page.evaluate(()=>window.panel.error),/temporarily unavailable/)
 await page.evaluate(async()=>{window.failNotices=false;window.failXpay=false;await window.refresh()});await page.waitForFunction(()=>window.panel.rows[0]?.eventId==='b')
 assert.equal(await page.evaluate(()=>window.panel.error),'')
 await page.evaluate(()=>{window.owner='c';window.emptyNotices=true;window.hangXpay=true;window.renderActivity(4)});await page.waitForFunction(()=>window.panel.busy&&window.panel.rows.length===0);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.panel.busy),true)
 await page.evaluate(()=>{window.hangXpay=false;window.releaseXpay()});await page.waitForFunction(()=>!window.panel.busy)
 console.log('PASS: partial feed success, quiet cached rows on failure/remount, account isolation, recovery')
}finally{await browser.close()}
