import assert from 'node:assert/strict';
import {sealStockQuote,openStockQuote} from '../api/pocket/xstocks-swap-provider.ts';
import {sealArcSwapQuote,openArcSwapQuote} from '../api/pocket/arc-swap-provider.ts';
const names=['POCKET_SWAP_QUOTE_SECRET','PRIVY_APP_SECRET'];const saved=Object.fromEntries(names.map(k=>[k,process.env[k]]));
try{
 const key='fixture-dedicated-quote-secret-at-least-32';process.env.POCKET_SWAP_QUOTE_SECRET=key;process.env.PRIVY_APP_SECRET='fixture-old-provider-secret-at-least-32';
 const quote={id:'fixture',ownerId:'fixture-owner',chainId:5042,expiresAt:Date.now()+60000};
 const stock=sealStockQuote(quote,'fixture-owner'),arc=sealArcSwapQuote(quote);
 assert.equal(stock,sealStockQuote(quote,'fixture-owner',key));assert.equal(arc,sealArcSwapQuote(quote,key));
 process.env.PRIVY_APP_SECRET='fixture-rotated-provider-secret-at-least-32';
 assert.equal(stock,sealStockQuote(quote,'fixture-owner'));assert.equal(arc,sealArcSwapQuote(quote));assert.deepEqual(openArcSwapQuote(arc,'fixture-owner'),quote);
 for(const value of [undefined,'','short']){if(value===undefined)delete process.env.POCKET_SWAP_QUOTE_SECRET;else process.env.POCKET_SWAP_QUOTE_SECRET=value;for(const action of [()=>sealStockQuote(quote,'fixture-owner'),()=>openStockQuote(stock,'fixture-owner'),()=>sealArcSwapQuote(quote),()=>openArcSwapQuote(arc,'fixture-owner')])assert.throws(action,/not configured/);}
 console.log('PASS quote key isolation: signatures unchanged with preserved key; Privy rotation has no effect; missing/short quote secret fails closed for both rails.');
}finally{for(const[k,v]of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
