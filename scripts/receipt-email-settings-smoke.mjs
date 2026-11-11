import assert from 'node:assert/strict'
import {normalizeReceiptEmailSettings as normalize} from '../src/lib/receiptEmailSettings.ts'
import {activeReceiptSettings} from '../api/developer-receipt-settings.ts'
const now='2026-11-02T12:00:00Z'
for(const previous of [undefined,{enabled:false,supportEmail:'',timeZone:'UTC'}])assert.equal(normalize(undefined,previous,now).enabled,true)
for(const enabled of [false,true,undefined])assert.equal(normalize({enabled,supportEmail:'',timeZone:'UTC'},undefined,now).enabled,true)
for(const bad of [{enabled:'true'},{supportEmail:'a@b.test\r\nBcc:x@y.test'},{timeZone:'not-a-zone'}])assert.throws(()=>normalize(bad,undefined,now))
const project={capabilities:['hosted_checkout'],checkoutMode:'human'}
for(const receiptEmails of [undefined,{enabled:false,supportEmail:'',timeZone:'UTC'}])assert.deepEqual(activeReceiptSettings({...project,receiptEmails}),{enabled:true,supportEmail:'',timeZone:'UTC'})
for(const patch of [{operationalStatus:'suspended'},{removal:{}},{checkoutMode:'agentic'},{capabilities:[]}])assert.equal(activeReceiptSettings({...project,...patch}),undefined)
const old={enabled:true,supportEmail:'support@example.test',timeZone:'Africa/Lagos',enabledAt:'2026-10-29T15:00:00Z'}
assert.deepEqual(activeReceiptSettings({...project,receiptEmails:old}),old)
assert.equal(normalize({...old,enabled:false},old,now).enabledAt,old.enabledAt)
console.log('PASS mandatory receipts: missing and legacy-disabled settings enabled, optional support, validation, historical cutoff and inactive project suppression.')

const {default:React}=await import('react');const {renderToStaticMarkup}=await import('react-dom/server');const {default:Panel}=await import('../src/developer/ReceiptEmailSettings.tsx');const html=renderToStaticMarkup(React.createElement(Panel,{value:{enabled:false,supportEmail:'',timeZone:'UTC'},eligible:true,onChange(){}}));assert.equal((html.match(/type="checkbox"/g)||[]).length,1,'only business summary opt-in may be disabled');assert(html.includes('automatically receive'));assert(html.includes('Merchant support email'));console.log('PASS receipt panel renders automatic delivery with no developer opt-out.');
