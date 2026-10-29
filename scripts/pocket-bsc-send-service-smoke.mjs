import assert from 'node:assert/strict'
import {createBscSendService} from '../api/pocket/bsc-send-service.ts'
import {POCKET_BSC} from '../src/pocket/lib/pocketBsc.ts'
const env={PRIVY_APP_ID:'app123',PRIVY_APP_SECRET:'secret',POCKET_SWAP_QUOTE_SECRET:'a'.repeat(40),POCKET_BSC_SEND_ENABLED:'true',POCKET_PRIVY_COMBINED_BILLING_ENABLED:'true',POCKET_XLAYER_FEE_POLICY:'observed_cost',POCKET_XLAYER_OBSERVED_COST_USD_MICROS:'0',POCKET_XLAYER_FEE_MARGIN_BPS:'0',POCKET_XLAYER_MIN_FEE_UNITS:'1',POCKET_XLAYER_MAX_FEE_UNITS:'1000000'}
for(const asset of ['USDC','USDT']){
 let store,queue=Promise.resolve(),owner='payer',sends=0,settlements=0,billing=0,approval=true,paid=false,settlement='pending'
 const checkout={id:'chkb_'+'1'.repeat(24),amount:'1.000000000000000001',asset,recipient:'0x'+'2'.repeat(40),token:POCKET_BSC.assets[asset],expiresAt:new Date(Date.now()+600000).toISOString()}
 const deps={env,durable:()=>true,read:async()=>structuredClone(store),mutate:(key,fn)=>{const work=queue.then(()=>{store=fn(structuredClone(store));return store});queue=work.catch(()=>{});return work},identity:async()=>({userId:owner}),wallet:async()=>({id:'wallet12345678',address:'0x'+'1'.repeat(40)}),runtime:()=>({chainId:async()=>56,balance:async()=>100n*10n**18n,rpc:async method=>method==='eth_blockNumber'?'0x10':null}),estimate:()=>async q=>({feeUnits:'10000000000000000',coverageFeeUnits:'10000000000000000',expiresAt:q.expiresAt}),readCheckout:async()=>checkout,assertPayable:async()=>{if(paid)throw Error('Already paid')},settleCheckout:async proof=>{assert.equal(proof.units,'1000000000000000001');settlements++;paid=true},approval:async()=>approval,billing:async()=>{billing++},journal:async()=>{},settlement:async()=>({status:settlement}),fetcher:async(url,options)=>{sends++;const b=JSON.parse(options.body);assert.equal(b.caip2,'eip155:56');assert.equal(b.sponsor,true);assert.equal(b.params.calls.length,2);assert.equal(options.headers['privy-authorization-signature'],'user-signature');return {ok:true,status:200,json:async()=>({data:{caip2:'eip155:56',hash:'0x'+'a'.repeat(64),transaction_id:'transaction123'}})}}}
 let service=createBscSendService(deps)
 async function call(body,headers={}){let status=200,data;await service.handler({method:'POST',body,headers},{setHeader(){},sendStatus(n){status=n},status(n){status=n;return this},json(v){data=v;return this}});return {status,data}}
 const quote=await call({action:'quote',asset,recipient:checkout.recipient,amount:checkout.amount});assert.equal(quote.status,200);assert.equal(quote.data.quote.asset,asset)
 const token=quote.data.quoteToken
 assert.equal((await call({action:'prepare',quoteToken:token+'0'})).status,503)
 owner='intruder';assert.equal((await call({action:'prepare',quoteToken:token})).status,503);owner='payer'
 approval=false;assert.equal((await call({action:'prepare',quoteToken:token},{'x-pocket-payment-approval':'pin'})).status,503);approval=true
 const prepared=await call({action:'prepare',quoteToken:token},{'x-pocket-payment-approval':'pin'});assert.equal(prepared.status,200,JSON.stringify(prepared));assert.equal(prepared.data.state,'prepared')
 const submitted=await call({action:'submit',operationId:prepared.data.operationId,authorization:'user-signature'});assert.equal(submitted.data.state,'pending');assert.equal(sends,1);assert.ok(billing>=2)
 service=createBscSendService(deps)
 await call({action:'submit',operationId:prepared.data.operationId,authorization:'user-signature'});assert.equal(sends,1)
 settlement='completed'
 const completed=await call({action:'status',operationId:prepared.data.operationId});assert.equal(completed.data.state,'completed');assert.equal(settlements,0)
 assert.equal(JSON.stringify(store).includes('user-signature'),false)
 assert.equal((await call({action:'quote',asset,recipient:checkout.recipient,amount:checkout.amount})).status,200)
 env.POCKET_BSC_SEND_ENABLED='false';assert.equal((await call({action:'capabilities'})).data.enabled,false);assert.equal((await call({action:'quote',asset,recipient:checkout.recipient,amount:checkout.amount})).status,503);env.POCKET_BSC_SEND_ENABLED='true';
 for(const amount of ['0','-1','1e3','1.0000000000000000001'])assert.equal((await call({action:'quote',asset,recipient:checkout.recipient,amount})).status,400);
 console.log('PASS BNB '+asset+' HTTP adapter: bound signed quote, wallet owner, PIN, fee coverage, sponsored dispatch, durable restart, settlement and no signature persistence.')
}
