import assert from 'node:assert/strict';
import {createXStocksAgreementClient,xStocksCheckoutUrl} from '../packages/sdk/src/xstocks.ts';
const id='xag_'+'a'.repeat(64),agreement={id,checkoutPath:'/agreements/xstocks/'+id,terms:{stockCustody:{policy:'xstocks-shares-v2'}}};let count=0;
const client=createXStocksAgreementClient({apiKey:'fixture-only',fetch:async(url,init)=>{count++;assert.equal(init.redirect,'error');assert.ok(url.startsWith('https://app.hashpaylink.com/'));return Response.json({ok:true,agreement})}});
assert.equal((await client.create({kind:'trade',stockCustody:'xstocks-shares-v2'},'fixture-idempotency-01')).id,id);assert.equal((await client.get(id)).id,id);assert.equal(count,2);
assert.equal(xStocksCheckoutUrl(agreement),'https://app.hashpaylink.com'+agreement.checkoutPath);assert.throws(()=>xStocksCheckoutUrl({...agreement,checkoutPath:'https://evil.test'}));
await assert.rejects(()=>client.create({kind:'trade'},'fixture-idempotency-01'),/custody/);globalThis.window={};assert.throws(()=>createXStocksAgreementClient({apiKey:'fixture'}),/server/);delete globalThis.window;
console.log('xStocks SDK passed: explicit policy, server-only key, fixed origin, idempotency and hosted URL validation.');
