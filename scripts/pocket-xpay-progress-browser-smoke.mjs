import { build } from 'esbuild'
import assert from 'node:assert/strict'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const contents=`import React from 'react';import{createRoot}from'react-dom/client';import Progress from './src/pocket/components/PocketXPayProgress';const root=createRoot(document.getElementById('root'));window.actions=[];window.render=(unknown=false)=>root.render(<Progress progress={{swap:'confirmed',bridge:'failed',payment:'waiting'}} recovery={{stage:'bridge',reason:'provider_unavailable',outcome:unknown?'unknown':'not_submitted',burn:'confirmed'}} onRetry={async action=>{window.actions.push(action);await new Promise(resolve=>window.finish=resolve)}}/>);window.render();`
const bundle=await build({stdin:{contents,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}})
const browser=await chromium.launch({channel:'chrome',headless:true})
try {
 const p=await browser.newPage({viewport:{width:390,height:844}})
 await p.setContent('<div id="root"></div>');await p.addScriptTag({content:bundle.outputFiles[0].text})
 await p.getByRole('button',{name:'Retry',exact:true}).click()
 assert.equal(await p.getByRole('button',{name:'Retry',exact:true}).isDisabled(),true)
 assert.deepEqual(await p.evaluate(()=>window.actions),['bridge_mint'])
 await p.evaluate(()=>window.finish());await p.waitForFunction(()=>!document.querySelector('button').disabled)
 await p.evaluate(()=>window.render(true));await p.getByText('Checking transaction status. Please do not pay again.').waitFor()
 assert.equal(await p.getByRole('button',{name:'Retry',exact:true}).count(),0)
 assert.equal(await p.getByText('Swapping', {exact:false}).count(),1)
 console.log('PASS recovery UI: confirmed burn retries mint only, Retry locked during request, unknown result removes Retry and preserves progress.')
} finally {await browser.close()}
