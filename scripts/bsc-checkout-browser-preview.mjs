// Synthetic checkout UI only. No live identity, wallet or payment requests.
import {build} from 'esbuild'
import fs from 'node:fs/promises'
import {resolve} from 'node:path'
const root=process.cwd(),out=resolve(root,'output/playwright/bsc-checkout-preview')
await fs.mkdir(out,{recursive:true})
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {BrowserRouter} from 'react-router-dom';import Page from './src/pages/BscCheckoutPage';import {ThemeProvider} from './src/lib/ThemeContext';import {setPocketPaymentApproval} from './src/pocket/lib/pocketPaymentApproval';import {bscPaymentRequest} from './src/pocket/lib/pocketBscPayment';
const params=new URLSearchParams(location.search),asset=params.get('asset')||'USDC',owner='fixture-payer',address='0x'+'1'.repeat(40),now=Date.now();
const checkout={id:'chkb_'+'1'.repeat(24),amount:'1.000000000000000001',asset,merchantName:'Fixture merchant',title:'Example order',status:'pending'};
const quote={version:1,chainId:56,id:'11111111-1111-4111-8111-111111111111',checkoutId:checkout.id,ownerId:owner,walletId:'wallet12345678',walletAddress:address,recipient:'0x'+'2'.repeat(40),asset,amountUnits:'1000000000000000001',reimbursementUnits:'10000000000000000',issuedAt:now,expiresAt:now+30000};
window.__bscFixture={sends:0,cancels:0,state:'prepared'};
window.addEventListener('pocket:payment-approval-request',e=>{setPocketPaymentApproval('fixture-approval',Date.now()+30000,'fixture');e.detail.resolve()});
window.fetch=async(url,options)=>{const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});if(String(url).includes('/api/v2/checkouts'))return response({ok:true,checkout:{...checkout,status:'paid'},returnUrl:'https://merchant.example/paid'});if(!String(url).includes('/api/pocket/bsc-payment'))throw Error('Unexpected fixture request');const body=JSON.parse(options.body),state=window.__bscFixture;const operation=()=>({ok:true,operationId:quote.id,checkoutId:checkout.id,state:state.state,quote});
if(body.action==='pending')return response({ok:true,operations:[]});
if(body.action==='balance')return response({ok:true,balanceUnits:params.has('empty')?'0':'100000000000000000000',fundingBufferUnits:'100000000000000000',address});
if(body.action==='quote')return params.has('empty')?response({ok:false,error:'Add funds to continue.'},503):response({ok:true,quote,quoteToken:'fixture-token',balanceUnits:'100000000000000000000'});
if(body.action==='prepare')return response({...operation(),request:bscPaymentRequest(quote,'fixtureapp')});
if(body.action==='cancel'){state.state='cancelled';state.cancels++;return response(operation())}
if(body.action==='submit'){state.sends++;state.state='pending';if(params.has('lost'))throw Error('Network reply lost');return response(operation())}
if(body.action==='status'){state.state='completed';return response(operation())}
throw Error('Unexpected action')};
createRoot(document.getElementById('root')).render(<ThemeProvider><BrowserRouter><Page checkout={checkout}/></BrowserRouter></ThemeProvider>);`
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},outfile:resolve(out,'app.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',define:{'process.env.NODE_ENV':'"development"','import.meta.env.VITE_PRIVY_APP_ID':'"fixtureapp"'},plugins:[{name:'fixture',setup(b){
b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'privy',namespace:'fixture'}));
b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`const user={id:'fixture-payer',email:{address:'payer@example.test'},linkedAccounts:[{type:'wallet',walletClientType:'privy',chainType:'ethereum',address:'0x'+'1'.repeat(40),id:'wallet12345678'}]};const token=async()=>'fixture-token';export const usePrivy=()=>({ready:true,authenticated:true,user,getAccessToken:token,logout:async()=>{}});export const useCreateWallet=()=>({createWallet:async()=>({address:'0x'+'1'.repeat(40)})});export const useAuthorizationSignature=()=>({generateAuthorizationSignature:async()=>{if(new URLSearchParams(location.search).has('cancel'))throw Error('User rejected approval');return {signature:'fixture-signature'}}});`,loader:'js'}));
b.onLoad({filter:/PocketPaymentSecurityGate\.tsx$/},()=>({contents:'export default function Gate({children}){return children}',loader:'tsx'}));
b.onLoad({filter:/PocketEmailLogin\.tsx$/},()=>({contents:'export default function Login(){return null}',loader:'tsx'}));
}}]})
await fs.copyFile(resolve(root,'output/playwright/developer-preview/styles.css'),resolve(out,'styles.css'))
await fs.writeFile(resolve(out,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="app.css"></head><body><div id="root"></div><script>window.__HASH_PAYLINK_CONFIG__={auth:{privyAppId:"fixtureapp",authBridge:"privy"}}</script><script type="module" src="app.js"></script></body></html>')
console.log(out)
