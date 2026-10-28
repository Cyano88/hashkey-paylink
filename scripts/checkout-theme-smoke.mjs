import assert from 'node:assert/strict'
import {build} from 'esbuild'
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE??'file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs')
const source=`import React from'react';import{createRoot}from'react-dom/client';import{ThemeProvider,useTheme}from'./src/lib/ThemeContext';function Probe(){const{theme,toggle}=useTheme();return <button onClick={toggle}>{theme}</button>}createRoot(document.getElementById('root')).render(<ThemeProvider forcedTheme={window.forced}><Probe/></ThemeProvider>);`
const bundle=await build({stdin:{contents:source,loader:'tsx',resolveDir:process.cwd()},bundle:true,write:false,jsx:'automatic'})
const browser=await chromium.launch({channel:'chrome',headless:true})
try{for(const system of ['dark','light'])for(const saved of ['dark','light']){
 const page=await browser.newPage({colorScheme:system})
 await page.route('https://theme.test/',r=>r.fulfill({contentType:'text/html',body:'<html class="dark"><head><meta name="theme-color" content="#000"></head><body><div id="root"></div></body></html>'}))
 for(const forced of ['light',null]){
  await page.goto('https://theme.test/')
  await page.evaluate(({forced,saved})=>{window.forced=forced??undefined;localStorage.setItem('hp_theme',saved)},{forced,saved})
  await page.addScriptTag({content:bundle.outputFiles[0].text})
  const expected=forced||saved;await page.getByRole('button',{name:expected,exact:true}).waitFor()
  assert.equal(await page.evaluate(()=>document.documentElement.classList.contains('dark')),expected==='dark')
  if(forced){assert.equal(await page.evaluate(()=>document.documentElement.style.colorScheme.split(' ').sort().join(' ')),'light only');await page.getByRole('button').click();assert.equal(await page.getByRole('button').innerText(),'light');assert.equal(await page.evaluate(()=>localStorage.getItem('hp_theme')),saved)}
  else{await page.getByRole('button').click();await page.getByRole('button',{name:saved==='dark'?'light':'dark',exact:true}).waitFor()}
 }
 await page.close()
}}finally{await browser.close()}
console.log('PASS fixed checkout light theme with dark/light system and saved preferences; toggle cannot override; other surfaces retain preference and toggle')
