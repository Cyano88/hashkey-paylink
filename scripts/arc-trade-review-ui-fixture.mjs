// Local visual rehearsal; all accounts, approvals, receipts and HTTP calls are synthetic.
import {build} from 'esbuild'
import {mkdir,writeFile} from 'node:fs/promises'
import {createServer} from 'node:http'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
const fixture=`import React from 'react';import{createRoot}from'react-dom/client';import Panel from './src/components/TradeReviewOperationsPanel';
const params=new URLSearchParams(location.search);document.documentElement.classList.toggle('dark',params.get('theme')==='dark');
const settled=params.get('scenario')==='receipt',id='tag_'+'a'.repeat(64),safe='0x'+'4'.repeat(40),owners=['0x'+'7'.repeat(40),'0x'+'8'.repeat(40)];
window.fixture={calls:[]};
const receipt={id:'trc_'+'b'.repeat(64),agreementId:id,chainId:5042,buyerAmountUnits:'500000',sellerAmountUnits:'750000',transactionHash:'0x'+'c'.repeat(64),blockNumber:'120',decimals:6};
window.fetch=async(url,options)=>{const body=JSON.parse(options.body);window.fixture.calls.push({url,...body});await new Promise(r=>setTimeout(r,80));return {ok:true,json:async()=>body.action==='list'?{ok:true,items:url.includes('arc-trade')?[{id,projectId:'dev_fixture12345',title:'Studio headphones',state:settled?8:5,observedBlock:'120'}]:[],nextCursor:null}:{ok:true,agreement:{id,title:'Studio headphones',terms:{description:'Original listing and accepted delivery terms.',payment:{chainId:5042},trade:{handover:'Delivery',location:'Lagos',returns:'Return if materially different from the listing.'}},evidence:[{hash:'fixture',body:'Buyer reported the item condition. Seller provided delivery evidence.',role:'customer'}],receipt:settled?receipt:undefined},status:{state:settled?8:5,amount:'1250000',decimals:6,actions:[]},reviewer:{address:safe,owners,threshold:2,nonce:'0'},decision:settled?null:{id:'0x'+'d'.repeat(64),buyerAmount:'0.5',reason:'Refund the buyer for the documented condition difference.',approvedOwners:owners,stale:false}}}};
createRoot(document.getElementById('root')).render(<Panel workspaceId='dev_fixture12345'/>);`
const auth=`const user={id:'fixture-admin'};const getAccessToken=async()=>'fixture';export const usePrivy=()=>({user,getAccessToken});export const useWallets=()=>({wallets:[]});`
const bundle=await build({stdin:{contents:fixture,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,format:'iife',jsx:'automatic',plugins:[{name:'review-fixture',setup(b){
 b.onResolve({filter:/^@privy-io\/react-auth$|\/PrivyWalletConnectButton$/},a=>({path:a.path,namespace:'fixture'}))
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:a.path.includes('react-auth')?auth:`import React from 'react';export const PrivyWalletConnectButton=props=>React.createElement('button',props,props.children)`}))
}}]})
const css=(await postcss([tailwind({darkMode:'class',content:['src/components/*ReviewOperationsPanel.tsx','src/components/ArcTradeReceiptCard.tsx']})]).process('@tailwind base;@tailwind components;@tailwind utilities;',{from:undefined})).css
const html=`<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Trade review fixture</title><style>${css}body{padding:24px 16px;font-family:Arial,sans-serif;background:#f8fafc;color:#111827}#root{max-width:1024px;margin:auto}.dark body{background:#08090b;color:#f9fafb}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`
await mkdir('output/playwright',{recursive:true});await writeFile('output/playwright/arc-review-fixture.html',html)
if(process.argv.includes('--serve'))createServer((_req,res)=>{res.setHeader('content-type','text/html');res.end(html)}).listen(4321,'127.0.0.1',()=>console.log('Synthetic Arc review fixture: http://127.0.0.1:4321'))
