import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {checkoutTestCss} from './checkout-test-css.mjs'
import {mkdir,readFile,readdir} from 'node:fs/promises'
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const bundle=await build({stdin:{contents:`import React,{useState}from'react';import{createRoot}from'react-dom/client';import Card from'./src/components/BrowserCheckoutCard';function App(){const[ready,setReady]=useState(false);window.sends=0;return <Card id="chk_test123456" attempt="pat_test123456" merchant="Lunchroom" title="Test order" amount="1.50 USDC" authenticated email="payer@example.com" fiat={false} network="base" networks={[{value:'base',label:'Base'}]} onNetwork={()=>{}} walletReady={ready} address="0x1111111111111111111111111111111111111111" balance="10" shortfall={null} total={ready?'1.50':null} fee={ready?'0':null} busy={false} blocked={false} error="" prepare={async()=>{if(!window.allowed)throw Object.assign(Error('Complete Basic verification to use bank transfers.'),{code:'KYC_BASIC_REQUIRED'});setReady(true)}} refresh={async()=>{}} pay={async()=>{window.sends++}}/>}createRoot(document.getElementById('root')).render(<App/>);`,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic',plugins:[{name:'fx-fixture',setup(b){b.onLoad({filter:/[\\/]usePocketLimitDisplay\.ts$/},()=>({contents:"export default function(){return{usdc:()=> '36 USDC',secondary:()=>null}}"}))}},{name:'auth-fixture',setup(b){b.onResolve({filter:/^@privy-io\/react-auth$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:"export const useCreateWallet=()=>({createWallet:async()=>null});export const usePrivy=()=>({getAccessToken:async()=>'fixture',user:{id:'payer'}})"}));b.onLoad({filter:/[\\/]PocketEmailLogin\.tsx$/},()=>({contents:'export default function Login(){return null}',loader:'tsx'}))}}]})
const browser=await chromium.launch({channel:'chrome',headless:true})
const css=await checkoutTestCss()
try{for(const width of [390,1280]){
 let level='none',environment='production',statusReads=0,receiptBlocked=false
 const page=await browser.newPage({viewport:{width,height:950}}),errors=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.route('https://checkout.test/**',async route=>{
  const path=new URL(route.request().url()).pathname
  if(path==='/api/receipt'&&receiptBlocked)return route.fulfill({status:403,json:{ok:false,code:'KYC_BASIC_REQUIRED',error:'Complete Basic verification.'}})
  if(path==='/api/pocket/kyc'){statusReads++;return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,environment,status:level==='none'?'not_started':'passed',level,paymentLevel:level,verified:false,workflow:{basicPassed:level!=='none',bvnPassed:level!=='none',complete:false,needsAdditional:false,methods:[]}})})}
  if(path.startsWith('/api/'))return route.fulfill({contentType:'application/json',body:'{"ok":true}'})
  if(/\.(png|svg|webp)$/.test(path))return route.fulfill({status:404,body:''})
  return route.fulfill({contentType:'text/html',body:'<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.outputFiles[0].text.replaceAll('</script','<\\/script')+'</script>'})
 })
 await page.goto('https://checkout.test/pay?checkout=chk_test123456')
 await page.getByRole('button',{name:'Continue',exact:true}).click()
 await page.getByRole('button',{name:'Verify identity',exact:true}).click()
 await page.getByRole('heading',{name:'Verify your identity'}).waitFor()
 await page.getByRole('button',{name:'Verify Basic',exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:/Advanced/}).count(),0,'Checkout does not offer Advanced KYC')
 await page.getByRole('button',{name:'Continue to payment',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Verification is not complete yet'}).waitFor()
 level='basic';environment='sandbox'
 await page.getByRole('button',{name:'Continue to payment',exact:true}).click()
 await page.getByRole('alert').filter({hasText:'Verification is not complete yet'}).waitFor()
 assert.equal(await page.evaluate(()=>window.sends),0)
 environment='production';await page.evaluate(()=>window.allowed=true)
 await mkdir('output/playwright',{recursive:true});await page.screenshot({path:'output/playwright/checkout-verification-'+width+'.png'})
 await page.getByRole('button',{name:'Continue to payment',exact:true}).click()
 await page.getByRole('button',{name:'Pay securely',exact:true}).waitFor()
 assert.equal(await page.evaluate(()=>window.sends),0);assert.ok(statusReads>=4);assert.deepEqual(errors,[])
 receiptBlocked=true;await page.evaluate(()=>{window.kycEvents=0;window.addEventListener('pocket:kyc-required',()=>window.kycEvents++)});
 await page.getByRole('button',{name:'Pay securely',exact:true}).click();await page.getByRole('button',{name:'Verify identity',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>window.kycEvents),0,'Inline checkout must not also open the native KYC prompt');assert.equal(await page.evaluate(()=>window.sends),0);
 await page.getByRole('button',{name:'Verify identity',exact:true}).click();await page.getByRole('heading',{name:'Verify your identity'}).waitFor();
 await page.close()
}}finally{await browser.close()}
console.log('PASS mobile/desktop web verification: actual panel loads, incomplete/sandbox states blocked, production status rechecked, return to review without payment.')
