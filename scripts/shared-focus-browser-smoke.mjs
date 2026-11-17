import assert from 'node:assert/strict';import fs from 'node:fs';import{build}from'esbuild';
const{chromium}=await import('file:///C:/Users/USER/AppData/Local/npm-cache/_npx/31e32ef8478fbf80/node_modules/playwright/index.mjs');
const bundle=await build({entryPoints:['src/lib/inputModality.ts'],bundle:true,write:false,format:'iife',globalName:'Focus'});
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(const dark of [false,true])for(const width of [390,1280]){
 const page=await browser.newPage({viewport:{width,height:844},hasTouch:true});
 await page.setContent(`<html class="${dark?'dark':''}"><style>body{background:${dark?'#111':'#fff'};color:${dark?'#eee':'#111'};font:16px sans-serif}input,textarea,select,button,a{display:block;margin:16px;padding:12px;border:1px solid #888;background:inherit;color:inherit}#invalid{border-color:rgb(220,38,38)}#selected{border:3px solid rgb(22,163,74)}#provider:focus{outline:3px solid blue}.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)}</style><main id="root"><input id="email" aria-label="Email" type="email"><input id="pin" aria-label="PIN" type="password"><textarea id="note" aria-label="Note"></textarea><select id="currency" aria-label="Currency"><option>USD</option></select><button id="save">Save</button><input id="invalid" aria-invalid="true" aria-label="Invalid field"><button id="selected" aria-pressed="true">Selected</button><label id="upload">Upload<input class="sr-only" type="file"></label></main><section data-hpl-focus-scope><input id="portal" aria-label="Portal field"></section><input id="provider" aria-label="Provider field"></html>`);
 await page.addStyleTag({content:fs.readFileSync('src/focus.css','utf8')});await page.addScriptTag({content:bundle.outputFiles[0].text});await page.evaluate(()=>window.cleanup=Focus.installInputModality());
 for(const id of ['email','pin','note','currency','save','invalid','selected','portal']){
  const field=page.locator('#'+id);await field.tap();await page.keyboard.press('Escape');assert.equal(await field.evaluate(e=>getComputedStyle(e).outlineStyle),'none',id+' touch');
  await page.keyboard.press('Tab');await field.focus();const css=await field.evaluate(e=>({style:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth,color:getComputedStyle(e).outlineColor}));assert.deepEqual(css,{style:'solid',width:'2px',color:dark?'rgb(209, 213, 219)':'rgb(55, 65, 81)'},id+' keyboard');
 }
 assert.equal(await page.locator('#invalid').evaluate(e=>getComputedStyle(e).borderColor),'rgb(220, 38, 38)');assert.equal(await page.locator('#selected').evaluate(e=>getComputedStyle(e).borderColor),'rgb(22, 163, 74)');
 await page.locator('#upload input').focus();assert.equal(await page.locator('#upload').evaluate(e=>getComputedStyle(e).outlineStyle),'solid');
 await page.locator('#provider').tap();assert.equal(await page.locator('#provider').evaluate(e=>getComputedStyle(e).outlineColor),'rgb(0, 0, 255)');
 await page.keyboard.press('Tab');await page.locator('#email').focus();await page.screenshot({path:`output/playwright/shared-focus-${width}-${dark?'dark':'light'}.png`});
 await page.evaluate(()=>window.cleanup());assert.equal(await page.evaluate(()=>document.documentElement.dataset.inputModality),undefined);await page.close();
}console.log('PASS touch/keyboard focus: email, password, textarea, select, buttons, portaled fields, hidden upload; light/dark at 390/1280; validation/selection borders and provider-owned UI preserved.');}finally{await browser.close()}
