import assert from 'node:assert/strict'
import {readFileSync,readdirSync,statSync,mkdirSync} from 'node:fs'
import {join} from 'node:path'
import {build} from 'esbuild'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Form from './src/pocket/components/PocketBridgeForm';import Select from './src/pocket/components/PocketSelect';function App(){const[amount,setAmount]=useState(''),[asset,setAsset]=useState('USDC'),[source,setSource]=useState('arbitrum'),[destination,setDestination]=useState('base');return <main style={{height:'100dvh',padding:'48px 16px 16px',display:'flex',flexDirection:'column',gap:12,maxWidth:430,margin:'auto'}}><h1 style={{height:44,flexShrink:0,textAlign:'center'}}>Bridge stablecoins</h1><Select ariaLabel='Bridge asset' value={asset} options={[{value:'USDC',label:'USDC'},{value:'USDT',label:'USDT'}]} onChange={setAsset}/><Form asset={asset} disabled={false} amount={amount} onAmount={setAmount} source={source} destination={destination} onSource={setSource} onDestination={setDestination} balance={28.80} onMax={()=>setAmount('28.75')} sources={[{value:'arbitrum',label:'Arbitrum'},{value:'base',label:'Base'}]} destinations={[{value:'base',label:'Base'}]} quote={amount?{receive:'1.99',minimumReceive:'1.98',fee:'0.01',total:'2.00'}:null}><button className='pocket-cta-primary w-full'>Confirm bridge</button></Form></main>}createRoot(document.getElementById('root')).render(<App/>);`
const result=await build({stdin:{contents:source,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'},plugins:[{name:'isolated',setup(b){b.onResolve({filter:/PocketNetworkBalance$/},()=>({path:'balance',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export default()=>null'}))}}]})
const assets='C:/Users/USER/pocket-bridge-recovery-hotfix/dist/assets';const css=readdirSync(assets).filter(f=>/^index-.*\.css$/.test(f)).sort((a,b)=>statSync(join(assets,b)).size-statSync(join(assets,a)).size)[0]
const browser=await chromium.launch({channel:'chrome',headless:true});mkdirSync('.codex-temp',{recursive:true})
try{
 for(const size of [{width:390,height:844},{width:375,height:667},{width:1024,height:900}]){
  const page=await browser.newPage({viewport:size});await page.route('https://fixture.test/**',route=>route.fulfill({contentType:'text/html',body:'<html class="dark"><body class="bg-black text-white"><div id="root"></div></body></html>'}));await page.goto('https://fixture.test');await page.addStyleTag({content:readFileSync(join(assets,css),'utf8')});await page.addScriptTag({content:result.outputFiles[0].text});
  await page.getByRole('button',{name:'2',exact:true}).click();await page.getByRole('button',{name:'Decimal point'}).click();await page.getByRole('button',{name:'0',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();
  assert.equal(await page.getByLabel('USDC bridge amount').inputValue(),'2.01');await page.getByRole('button',{name:'Delete digit'}).click();assert.equal(await page.getByLabel('USDC bridge amount').inputValue(),'2.0');
  assert.equal(await page.getByLabel('USDC bridge amount').getAttribute('inputmode'),'none');assert.equal(await page.getByLabel('USDC bridge amount').getAttribute('readonly'),'');
  for(const label of ['Confirm bridge','Delete digit']){const box=await page.getByRole('button',{name:label,exact:true}).boundingBox();assert.ok(box.y+box.height<=size.height+1,label+' must fit '+size.height)}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.getByRole('button',{name:'Bridge asset'}).click();await page.getByRole('dialog').waitFor();await page.getByRole('option',{name:'USDT',exact:true}).click();assert.equal(await page.getByRole('dialog').count(),0);assert.equal(await page.getByLabel('USDT bridge amount').inputValue(),'2.0')
  await page.screenshot({path:'.codex-temp/exchange-'+size.width+'.png'});await page.close()
 }
 console.log('PASS shared exchange UI: keypad entry/delete, no native keyboard, asset sheet, CTA/keypad fit at 375/390/1024 widths')
}finally{await browser.close()}
