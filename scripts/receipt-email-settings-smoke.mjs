import assert from'node:assert/strict';import{normalizeReceiptEmailSettings as normalize}from'../src/lib/receiptEmailSettings.ts';import{activeReceiptSettings}from'../api/developer-receipt-settings.ts';
const now='2026-10-29T15:00:00Z',later='2026-10-30T15:00:00Z';
assert.equal(normalize(undefined,undefined,now).enabled,false);
for(const bad of[{enabled:'true'},{enabled:true,supportEmail:''},{enabled:true,supportEmail:'a@b.test\r\nBcc:x@y.test'},{enabled:true,supportEmail:'a@b.test',timeZone:'not-a-zone'}])assert.throws(()=>normalize(bad,undefined,now));
const s=normalize({enabled:true,supportEmail:'support@example.test',timeZone:'Africa/Lagos',enabledAt:'2000-01-01'},undefined,now);assert.equal(s.enabledAt,now);assert.equal(normalize({...s,timeZone:'UTC'},s,later).enabledAt,now);const off=normalize({...s,enabled:false},s,later);assert.equal(off.enabledAt,undefined);assert.equal(normalize(s,off,later).enabledAt,later);
const p={receiptEmails:s,capabilities:['hosted_checkout'],checkoutMode:'human',xlayerCheckout:{},settlementMode:'usdc'};assert.deepEqual(activeReceiptSettings(p),s);for(const patch of[{operationalStatus:'suspended'},{removal:{}},{checkoutMode:'agentic'},{capabilities:[]},{receiptEmails:off}])assert.equal(activeReceiptSettings({...p,...patch}),undefined);
console.log('PASS receipt settings: defaults, validated support/timezone, trusted enable time, re-enable cutoff and inactive project suppression.');

for(const settlementMode of ['usdc','ngn','ugx'])assert.deepEqual(activeReceiptSettings({...p,xlayerCheckout:undefined,settlementMode}),s);
