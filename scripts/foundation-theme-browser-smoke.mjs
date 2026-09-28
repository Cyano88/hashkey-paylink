import fs from 'node:fs/promises'
import path from 'node:path'
import {createServer} from 'vite'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const audit = async page => {
 const results=[];
 for(const dark of [false,true]) {
  await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);
  for(const width of [390,1024,1440]) {
   await page.setViewportSize({width,height:900});
   const result=await page.evaluate(()=>{
    const rgb=v=>(v.match(/[\d.]+/g)||[]).map(Number);
    const lum=a=>a.slice(0,3).map(x=>{x/=255;return x<=.04045?x/12.92:((x+.055)/1.055)**2.4}).reduce((s,x,i)=>s+x*[.2126,.7152,.0722][i],0);
    const bg=e=>{while(e){const a=rgb(getComputedStyle(e).backgroundColor);if(a.length===3 || a[3]===1)return a;e=e.parentElement}return [255,255,255]};
    const selectors='.foundation-primary-cta,.foundation-secondary-cta,.api-primary-action,#retail a,#contact a,#contact p,#projects a,#products .product-card-action';
    const checked=[...document.querySelectorAll(selectors)].filter(e=>e.getBoundingClientRect().width>0).map(e=>{const f=lum(rgb(getComputedStyle(e).color)),b=lum(bg(e));return {text:e.textContent.trim().slice(0,70),ratio:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)}});
    const failed=checked.filter(e=>e.ratio<4.5);
    const shell=document.querySelector('.hpl-snap-shell');
    return {checked:checked.length,failed,footerBackground:getComputedStyle(document.querySelector('#contact')).backgroundColor,overflow:shell.scrollWidth>shell.clientWidth+1};
   });
   if(result.failed.length || result.overflow || result.footerBackground!=='rgb(255, 255, 255)')throw Error(JSON.stringify({dark,width,...result}));
   results.push({dark,width,checked:result.checked,contrastPass:true});
  }
 }
 await page.evaluate(()=>{document.documentElement.classList.add('dark');document.querySelector('main').removeAttribute('data-foundation-colour-scope')});
 const oldBg=await page.locator('#contact').evaluate(e=>getComputedStyle(e).backgroundColor);
 await page.evaluate(()=>document.querySelector('main').setAttribute('data-foundation-colour-scope','light'));
 if(oldBg!=='rgb(30, 30, 30)')throw Error('Existing dark theme was changed outside Foundation');
 return {results,existingAppDarkThemePreserved:true};
}
await fs.mkdir('.codex-temp',{recursive:true})
const fixture=await fs.mkdtemp(path.join('.codex-temp','foundation-theme-'))
await fs.writeFile(path.join(fixture,'index.html'),'<html><head><meta name="viewport" content="width=device-width,initial-scale=1" /></head><body><div id="root"></div><script type="module" src="./preview.tsx"></script></body></html>')
await fs.writeFile(path.join(fixture,'preview.tsx'),"import React from 'react';import{createRoot}from'react-dom/client';import{BrowserRouter}from'react-router-dom';import FoundationPage from '../../src/pages/FoundationPage';import '../../src/index.css';createRoot(document.getElementById('root')!).render(<BrowserRouter><FoundationPage/></BrowserRouter>);")
const server=await createServer({server:{host:'127.0.0.1',port:5193,strictPort:true},logLevel:'error'})
let browser
try {
 await server.listen()
 browser=await chromium.launch({channel:'chrome',headless:true})
 const page=await browser.newPage({reducedMotion:'reduce'})
 await page.goto('http://127.0.0.1:5193/'+fixture.replaceAll('\\','/')+'/index.html')
 await page.locator('#contact').waitFor({state:'attached'})
 const result=await audit(page)
 for(const button of await page.locator('.faq-header').all()) {
  await button.click()
  if(await button.getAttribute('aria-expanded')!=='true')throw Error('FAQ did not open')
 }
 for(const [name,url] of [['Explore Hash PayStream','https://hashpaystream.app'],['Explore PolyDesk','https://polydesk.trade']]) {
  if(await page.getByRole('link',{name,exact:true}).getAttribute('href')!==url)throw Error('Project destination changed')
 }
 await page.setViewportSize({width:390,height:844})
 await page.locator('.hpl-snap-shell').evaluate(el=>el.scrollTop=el.scrollHeight)
 const privacy=await page.getByRole('link',{name:'Privacy',exact:true}).boundingBox()
 if(!privacy || privacy.y+privacy.height>845)throw Error('Footer links are clipped')
 console.log(JSON.stringify({...result,faqsOpen:true,projectLinksVerified:true,mobileFooterReachable:true}))
} finally {
 await browser?.close()
 await server.close()
 await fs.rm(path.join(fixture,'index.html'))
 await fs.rm(path.join(fixture,'preview.tsx'))
 await fs.rmdir(fixture)
}
