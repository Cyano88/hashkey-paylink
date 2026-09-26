import assert from 'node:assert/strict';
import {tradeReturnUrl} from '../src/lib/xstocksAgreement/tradeReturn.ts';
const valid='https://hashpaystream.app/trade?view=enquiries&conversation=11111111-1111-4111-8111-111111111111';
assert.equal(tradeReturnUrl(valid),valid);
for(const input of [null,'javascript:alert(1)',valid.replace('https:','http:'),valid.replace('hashpaystream.app','hashpaystream.app.evil.example'),valid.replace('/trade','/logout'),valid+'&success=true',valid+'&view=enquiries',valid+'#paid',valid.replace('https://','https://user:pass@'),valid.replace('11111111-1111-4111-8111-111111111111','x')])assert.equal(tradeReturnUrl(input),undefined,input);
console.log('Trade return link passed: exact HTTPS host/path, conversation ID, no credentials, fragments, duplicate params or payment-status hints.');
