import assert from 'node:assert/strict'
import {createSolanaUsdtBridgeHandler,solanaUsdtBridgePreview} from '../api/pocket/solana-usdt-bridge-api.ts'
let record={id:'test',ownerId:'owner',walletId:'wallet',walletAddress:'solana-wallet',destinationAddress:'0xabc',phase:'quoted',quote:{source:'solana',destination:'base',transaction:'prepared',amountUnits:'1000000',receiveUnits:'990000',minimumUnits:'980000',providerFeeUnits:'10000',networkFeeUnits:'1500',totalUnits:'1001500',expiresAt:Date.now()+10000}}
let enabled=false,identity='owner',saved=false,submitted=false,settled=false
const state={read:async(owner,id)=>{assert.equal(id,'test');if(owner!==record.ownerId)throw Object.assign(Error('Bridge not found.'),{status:404});return record},saveSigned:async(owner,id,raw)=>{assert.equal(owner,'owner');assert.equal(raw,'signed');saved=true;record={...record,signedTransaction:raw,phase:'signed'}},submit:async()=>{assert.ok(saved);submitted=true;return record={...record,phase:'source_confirmed',signature:'source-hash'}}}
const handler=createSolanaUsdtBridgeHandler({verifyUser:async()=>({userId:identity}),enabled:()=>enabled,state:()=>state,rpc:()=>({}),journal:async()=>{},readLink:async key=>({circleWalletId:'wallet',circleWalletAddress:key.includes('solana')?'solana-wallet':'0xabc'}),reconcile:async()=>{assert.ok(submitted);settled=true;return {status:'completed',settlement:{transactionHash:'destination-hash'}}}})
async function call(body,method='POST'){let status=200,result;const res={setHeader(){},status(n){status=n;return this},json(value){result=value;return this}};await handler({method,body},res);return {status,...result}}
assert.equal((await call({},'GET')).status,405)
assert.equal((await call({action:'quote',source:'solana'})).ok,false)
enabled=true
assert.equal((await call({action:'quote',source:'base',destination:'solana',amount:'1'})).ok,false)
assert.equal((await call({action:'status',quoteToken:'not-solana'})).status,400)
identity='another';assert.equal((await call({action:'status',quoteToken:'solana:test'})).status,404);identity='owner'
const prepared=await call({action:'execute',quoteToken:'solana:test'});assert.equal(prepared.transaction,'prepared')
const preview=solanaUsdtBridgePreview(record);assert.equal(preview.quote.total,'1.0015');assert.equal(preview.quote.fee,'0.0115');assert.equal(preview.quoteToken,'solana:test')
const result=await call({action:'submit',quoteToken:'solana:test',transaction:'signed'})
assert.equal(result.status,'completed');assert.equal(result.destinationTxHash,'destination-hash');assert.ok(saved&&submitted&&settled)
// Recovery is available even when new quotes are disabled.
enabled=false;assert.equal((await call({action:'status',quoteToken:'solana:test'})).status,'completed')
console.log('Solana USDT API checks passed: rollout gate, source-only route, owner isolation, saved approval payload, fee preview, persist-before-submit, verified destination response and recovery with new quotes disabled.')
