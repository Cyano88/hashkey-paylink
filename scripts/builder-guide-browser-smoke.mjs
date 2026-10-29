import {build} from 'esbuild'
import {mkdir,readFile,writeFile} from 'node:fs/promises'
import {resolve,extname,sep} from 'node:path'
import {createServer} from 'node:http'
import {spawnSync} from 'node:child_process'
import assert from 'node:assert/strict'
const root=process.cwd(),out=resolve('output/playwright/builder-guide-preview');await mkdir(out,{recursive:true})
await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import DocsApp from './src/surfaces/DocsApp';import BuilderQuickstart from './src/developer/BuilderQuickstart';import{ThemeProvider}from'./src/lib/ThemeContext';createRoot(document.getElementById('root')).render(<ThemeProvider>{location.pathname==='/console'?<main style={{maxWidth:900,margin:'auto',padding:24}}><BuilderQuickstart returnOrigin="https://shop.example" hasFunding={true}/></main>:<DocsApp/>}</ThemeProvider>);`,loader:'tsx',resolveDir:root},outfile:resolve(out,'app.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'raw-code',setup(b){b.onResolve({filter:/\?raw$/},a=>({path:resolve(a.resolveDir,a.path.slice(0,-4)),namespace:'raw-code'}));b.onLoad({filter:/.*/,namespace:'raw-code'},async a=>({contents:'export default '+JSON.stringify(await readFile(a.path,'utf8')),loader:'js'}))}}]})
const css=spawnSync(process.execPath,['node_modules/tailwindcss/lib/cli.js','-i','src/index.css','-o',resolve(out,'styles.css')],{encoding:'utf8'});if(css.status!==0)throw Error(css.stderr)
await writeFile(resolve(out,'index.html'),'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>')
const server=createServer(async(req,res)=>{try{let file=resolve(out,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(out+sep)||!extname(file))file=resolve(out,'index.html');res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(file)]||'application/octet-stream');res.end(await readFile(file))}catch{res.statusCode=404;res.end()}});await new Promise(r=>server.listen(0,'127.0.0.1',r))
const{chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');const browser=await chromium.launch({channel:'chrome',headless:true})
try{const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port
 for(const width of[320,390,1280])for(const dark of[false,true]){
  await page.setViewportSize({width,height:844});await page.goto(base+'/docs/getting-started');await page.getByRole('heading',{name:'Accept your first payment',exact:true}).waitFor();await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark)
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Guide overflow at '+width)
  for(const title of['Who does what?','4. Receive and verify a webhook','5. Confirm the order on your server','7. Test before you launch'])assert.equal(await page.getByRole('heading',{name:title,exact:true}).count(),1)
  await page.locator('summary').filter({hasText:'Show complete server helper module'}).click();assert((await page.locator('pre').allTextContents()).some(t=>t.includes('export function verifyWebhook')))
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Expanded example overflow')
  if(width===390&&!dark)await page.screenshot({path:'output/playwright/builder-guide-mobile.png'})
  await page.goto(base+'/console');await page.getByRole('heading',{name:'Connect your app'}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Console overflow');assert.equal(await page.getByRole('heading',{name:'1. Server only'}).count(),1);assert.equal(await page.getByRole('heading',{name:'2. Browser only'}).count(),1)
 }
 await page.goto(base+'/docs');await page.getByRole('link',{name:'Accept your first payment'}).last().click();await page.getByRole('heading',{name:'Accept your first payment'}).waitFor()
 await page.goto(base+'/docs/sdk');await page.getByRole('heading',{name:'SDK or direct API?',exact:true}).waitFor();assert(!await page.getByText('npm install @hashpaylink/sdk',{exact:true}).count())
 await page.goto(base+'/docs/api');assert((await page.locator('main').innerText()).includes('Local bank/mobile-money onboarding remains pending'))
 assert.deepEqual(errors,[]);console.log('PASS actual docs and console guide at 320/390/1280, light/dark, expandable real sample, separated browser/server code, navigation, bank boundary and no page errors.')
}finally{await browser.close();await new Promise(r=>server.close(r))}
