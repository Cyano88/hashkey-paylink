import assert from 'node:assert/strict';import {build} from 'esbuild';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'playwright');
const mocks={
'../../lib/circleEvmEmailWallet':`export async function approveCircleMigrationChallenge(){throw Error('Approval failed')};export async function prepareCircleEvmReplacement(){window.mutations++;throw Error('Unexpected preparation')};export async function reviewCircleEvmReplacement(){throw Error('Unexpected review')}`,
'../controllers/usePocketWalletController':`export async function unlockPocketBaseWallet(){throw Error('Unexpected unlock')}`,
'./PocketPreviousWallets':`export default function Previous(){return null}`,
'../lib/pocketRoutes':`export const POCKET_BASE_PATH='';export const POCKET_ROUTES={home:'/home'};export const pocketApiUrl=x=>x`,
'../lib/pocketPaymentApproval':`export async function requestPocketPaymentApproval(){throw Error('Unexpected approval')}`,
'../lib/pocketMigrationClient':`export async function pocketMigrationRequest(token,body){window.calls.push(body.action);if(body.action==='status')return {snapshot:window.snapshot};if(body.action==='reconcile'){if(window.statusError)throw Error('Temporary status failure');return {state:'pending',snapshot:window.snapshot}};throw Error('Unexpected mutation')}`
};
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {MemoryRouter} from 'react-router-dom';import Execution from './src/pocket/components/PocketMigrationExecution';import Preparation from './src/pocket/components/PocketWalletPreparation';const token=async()=> 'synthetic';window.calls=[];window.mutations=0;window.snapshot={enabled:true,revision:'r',phase:'pending',rows:[{network:'base',amount:'2',state:'pending'}]};window.statusError=true;window.fetch=()=>new Promise(resolve=>window.resolveStatus=resolve);window.mount=(kind)=>createRoot(document.getElementById('root')).render(<MemoryRouter>{kind==='preparation'?<Preparation email='synthetic@example.invalid' getAccessToken={token}/>:<Execution session={{userToken:'synthetic'}} getAccessToken={token} onComplete={()=>window.completed=true}/>}</MemoryRouter>);`;
const bundle=await build({stdin:{contents:entry,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'mocks',setup(b){b.onResolve({filter:/.*/},a=>mocks[a.path]?{path:a.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:mocks[a.path],loader:'jsx'}))}}]});
const browser=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(5000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div id="root"></div>');await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>window.mount('execution'));
 await page.getByRole('alert').waitFor();assert.equal(await page.getByRole('button').count(),1);
 await page.evaluate(()=>{window.statusError=false;window.snapshot={...window.snapshot,phase:'ready-to-activate',rows:[{network:'base',amount:'2',state:'confirmed'}]}});
 await page.getByRole('button',{name:'Check progress',exact:true}).click();await page.getByRole('button',{name:'Activate updated wallets',exact:true}).waitFor();assert.equal(await page.getByRole('alert').count(),0);assert.equal(await page.getByRole('button').count(),1);
 await page.close();
 const p=await browser.newPage();await p.setContent('<div id="root"></div>');await p.addScriptTag({content:bundle.outputFiles[0].text});await p.evaluate(()=>window.mount('preparation'));
 await p.getByText('Checking wallet update...',{exact:true}).waitFor();assert.equal(await p.getByRole('button').count(),0);
 await p.evaluate(()=>window.resolveStatus({ok:true,json:async()=>({ok:true,phase:'completed'})}));await p.getByRole('button',{name:'Proceed to Pocket',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Verify updated wallets'}).count(),0);assert.equal(await p.getByRole('alert').count(),0);assert.equal(await p.evaluate(()=>window.mutations),0);
 assert.deepEqual(errors,[]);console.log('PASS: one primary migration action per state, recovered status clears stale error, completed accounts never flash preparation CTA or create wallets.');
}finally{await browser.close()}
