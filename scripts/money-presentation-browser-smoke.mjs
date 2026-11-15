import assert from 'node:assert/strict'
import {build} from 'esbuild'
import {mkdirSync} from 'node:fs'
import {checkoutTestCss} from './checkout-test-css.mjs'
const root=process.env.CHECKOUT_SOURCE_ROOT||process.cwd()
const {chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React,{useState}from'react';import{createRoot}from'react-dom/client';import{MoneyText}from'./src/components/MoneyText';import Card from'./src/pocket/components/PocketStockBalanceCard';import Bank from'./src/pocket/components/PocketBankAmountFields';function App(){const[visible,setVisible]=useState(true),[amount,setAmount]=useState('1433.19');window.rawAmount=amount;return <main style={{maxWidth:420,margin:'auto',padding:16,fontFamily:'Arial,sans-serif'}}><Card total={1250.34} cash={25} investments={1225.34} gas={0.012} loading={false} visible={visible} onToggle={()=>setVisible(!visible)} onScan={()=>{}} onCurrencySelect={()=>{}} displayCurrency='NGN' localEquivalent='NGN 1,433.19'/><div data-fixture-money style={{fontSize:24,marginTop:16}}><MoneyText>USDC 1.500004</MoneyText></div><div data-fixture-money style={{fontSize:12}}><MoneyText>0.000004 USDC</MoneyText></div><div data-fixture-money style={{fontSize:16}}><MoneyText>USDC -1.50</MoneyText></div><div data-fixture-money style={{fontSize:16}}><MoneyText>+1.50 USDC</MoneyText></div><Bank accountName='Example Seller' bankName='Example Bank' accountNumber='****9696' amount={amount} memo='' onChangeRecipient={()=>{}} onAmountChange={setAmount} onMemoChange={()=>{}}/></main>}createRoot(document.getElementById('root')).render(<App/>);`
const bundle=await build({stdin:{contents:source,resolveDir:root,loader:'tsx'},bundle:true,write:false,jsx:'automatic',define:{'import.meta.env':'{}'}})
const css=await checkoutTestCss(),browser=await chromium.launch({channel:'chrome',headless:true});mkdirSync('output/playwright',{recursive:true})
try{for(const width of [320,390,1280])for(const dark of [false,true]){
const page=await browser.newPage({viewport:{width,height:1000}});await page.setContent('<style>'+css+'</style><div id="root"></div>');await page.evaluate(d=>document.documentElement.classList.toggle('dark',d),dark);await page.addScriptTag({content:bundle.outputFiles[0].text});await page.getByRole('button',{name:'Hide balances'}).waitFor()
assert.equal(await page.locator('[data-pocket-total-amount]').innerText(),'USD 1,250.34')
assert.deepEqual(await page.locator('[data-fixture-money]').allTextContents(),['USDC 1.500004','USDC 0.000004','-USDC 1.50','+USDC 1.50'])
assert(await page.locator('[data-money-code]').evaluateAll(nodes=>nodes.every(n=>{const c=getComputedStyle(n),p=getComputedStyle(n.parentElement);return c.fontFamily===p.fontFamily&&parseFloat(c.fontSize)>=10&&parseFloat(c.fontSize)<parseFloat(p.fontSize)})))
assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
await page.getByLabel('Amount in naira',{exact:true}).fill('12345.67');assert.equal(await page.evaluate(()=>window.rawAmount),'12345.67');assert.equal((await page.getByLabel('Amount in naira',{exact:true}).inputValue()).replaceAll(',',''),'12345.67')
await page.screenshot({path:'output/playwright/money-style-'+width+'-'+(dark?'dark':'light')+'.png'})
await page.getByRole('button',{name:'Hide balances'}).click();assert(!(await page.locator('[data-pocket-total-amount]').innerText()).includes('1,250'));await page.close()
}console.log('PASS code-first typography, inherited font, readable code sizes, exact subcent amounts, numeric input preservation, hidden balances and 320/390/1280 light/dark layouts: '+root)}finally{await browser.close()}
