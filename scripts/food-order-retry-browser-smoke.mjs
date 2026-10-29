import assert from 'node:assert/strict';import {build} from 'esbuild';
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const built=await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Page from './src/pages/FoodDemoPage';createRoot(document.getElementById('root')).render(<Page/>);`,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},plugins:[{name:'router',setup(b){b.onResolve({filter:/^react-router-dom$/},()=>({path:'router',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const useNavigate=()=>url=>{window.destination=url}` }));}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{for(const status of ['expired','pending','paid','processing','unavailable','missing']){
 const page=await browser.newPage();let posts=[];const old='a'.repeat(32);
 await page.route('https://food.test/**',async route=>{const r=route.request(),u=new URL(r.url());if(!u.pathname.startsWith('/api/'))return route.fulfill({contentType:'text/html',body:'<div id="root"></div>'});
 if(r.method()==='POST'){posts.push(r.postDataJSON());return route.fulfill({json:{ok:true,checkoutUrl:'/pay/c/chks_'+'b'.repeat(24)}})}
 if(!u.search)return route.fulfill({json:{ok:true,liveEnabled:true,acceptedAssets:['USDT']}});
 return route.fulfill({status:status==='unavailable'?503:status==='missing'?404:200,json:status==='unavailable'||status==='missing'?{ok:false,error:'Cannot verify order'}:{ok:true,order:{id:old,status,amount:'1.5',asset:'USDT'}}});});
 await page.goto('https://food.test/launchroom');await page.evaluate(old=>{sessionStorage.setItem('lunchroom.basket',JSON.stringify({cart:{plantain:1},screen:'review'}));sessionStorage.setItem('lunchroom.order',JSON.stringify({requestId:old,createdAt:Date.now()-20*60000,fingerprint:JSON.stringify([{id:'plantain',quantity:1}])}));},old);
 await page.addScriptTag({content:built.outputFiles[0].text});await page.getByRole('button',{name:'Checkout',exact:false}).click();
 if(status==='unavailable'){await page.getByRole('alert').waitFor();assert.equal(posts.length,0)}
 else{await page.waitForFunction(()=>window.destination);if(['paid','processing'].includes(status)){assert.equal(posts.length,0);assert.equal(await page.evaluate(()=>window.destination),'/launchroom?order='+old)}else{assert.equal(posts.length,1);assert.equal(posts[0].requestId===old,status!=='expired');}}
 await page.close();
}}finally{await browser.close()}
console.log('PASS real Lunchroom UI: expired order gets new reference; pending/missing reuse reference; paid/processing recover; unavailable status blocks creation.');
