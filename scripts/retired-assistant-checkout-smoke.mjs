import assert from 'node:assert/strict'
import {isRetiredAssistantCheckout} from '../src/lib/retiredAssistantCheckout.ts'
for(const query of ['id=agent-hash-pro-abc&a=10','src=telegram-helper&g=%2Fagent','id=normal&id=agent-hash-pro-abc','src=%20TELEGRAM-HELPER%20'])assert.equal(isRetiredAssistantCheckout(new URLSearchParams(query)),true)
for(const query of ['id=merchant-payment&a=10','src=bank-send','src=ngpos','src=service','src=agent&walletManager=service','m=Agent+Hash+Pro','checkout=chk_12345678'])assert.equal(isRetiredAssistantCheckout(new URLSearchParams(query)),false)
console.log('PASS retired assistant checkout: old subscription/helper links blocked; ordinary merchant, service, bank, POS and wallet funding links preserved.')
