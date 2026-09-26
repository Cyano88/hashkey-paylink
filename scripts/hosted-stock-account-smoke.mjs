import assert from 'node:assert/strict'
import {createStockWalletSessionHandlers,resolveStockWalletAccount} from '../api/stock-wallet-account.ts'
import {createStockWalletBalancesHandler} from '../api/stock-wallet-balances.ts'
import {cliRequestScope} from '../api/developer-cli-grants.ts'
const address='0x'+'1'.repeat(40), other='0x'+'2'.repeat(40), userId='did:privy:buyer', walletAppId='test_app_1234'
const env={PRIVY_APP_ID:walletAppId,PRIVY_APP_SECRET:'test-only-not-a-secret'}
const wallet={type:'wallet',chainType:'ethereum',walletClientType:'privy',connectorType:'embedded',address}
const load=async()=>({id:userId,linkedAccounts:[wallet]})
assert.equal((await resolveStockWalletAccount(userId,walletAppId,env,load)).wallet,address)
await assert.rejects(()=>resolveStockWalletAccount(userId,'wrong_app',env,load),e=>e.status===409)
await assert.rejects(()=>resolveStockWalletAccount(userId,walletAppId,env,async()=>({id:'did:privy:other',linkedAccounts:[wallet]})),e=>e.status===403)
await assert.rejects(()=>resolveStockWalletAccount(userId,walletAppId,env,async()=>({id:userId,linkedAccounts:[wallet,{...wallet,address:other}]})),e=>e.status===409)
await assert.rejects(()=>resolveStockWalletAccount(userId,walletAppId,env,async()=>({id:userId,linkedAccounts:[{...wallet,connectorType:'injected'}]})),e=>e.status===409)
let project='project_a',owner=userId,resolved=address,allowed=true
const store=new Map(),handlers=createStockWalletSessionHandlers({policy:async()=>allowed?{partnerId:project,merchantName:'Test project',environment:'live',checkoutMode:'human'}:null,hasStore:()=>true,account:async(id,app)=>{assert.equal(id,userId);assert.equal(app,walletAppId);return {userId:id,walletAppId:app,wallet:resolved}},identity:async()=>({userId:owner}),read:async k=>store.get(k),mutate:async(k,fn)=>{const value=await fn(store.get(k));store.set(k,value);return value}})
async function call(handler,body,headers={}){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:'POST',body,headers},res);return res}
const first=await call(handlers.developer,{userId,walletAppId});assert.equal(first.statusCode,200);const id=first.body.session.id;assert.match(id,/^wst_[a-f0-9]{64}$/)
assert.equal((await call(handlers.developer,{userId,walletAppId})).body.session.id,id)
project='project_b';assert.notEqual((await call(handlers.developer,{userId,walletAppId})).body.session.id,id)
assert.equal((await call(handlers.developer,{userId,walletAppId,wallet:address})).statusCode,400)
allowed=false;assert.equal((await call(handlers.developer,{userId,walletAppId})).statusCode,403);allowed=true
assert.equal((await call(handlers.participant,{sessionId:id,action:'read'})).body.session.wallet,address)
owner='did:privy:wrong';assert.equal((await call(handlers.participant,{sessionId:id,action:'read'})).statusCode,404);owner=userId
assert.equal((await call(handlers.participant,{sessionId:id,action:'send'})).statusCode,400)
assert.equal((await call(handlers.participant,{sessionId:id,action:'read'},{'x-api-key':'test'})).statusCode,401)
resolved=other;assert.equal((await call(handlers.participant,{sessionId:id,action:'read'})).statusCode,409)
const balances=createStockWalletBalancesHandler({policy:async()=>({partnerId:'a',environment:'live',checkoutMode:'human'}),account:async(id,app)=>({userId:id,walletAppId:app,wallet:address})})
let res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}}
await balances({method:'POST',body:{userId,walletAppId},headers:{},originalUrl:'/api/v2/wallets/stocks/receive'},res)
assert.equal(res.body.wallet,address);assert.equal(res.body.userId,userId);assert.equal(res.body.receive.qrValue,address)
res={...res,statusCode:200};await balances({method:'POST',body:{userId,walletAppId,wallet:other},headers:{}},res);assert.equal(res.statusCode,400)
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/stocks/open'}),'wallet:stocks:read')
assert.equal(cliRequestScope({method:'POST',originalUrl:'/api/v2/wallets/stocks/participant'}),null)
console.log('Hosted stock account: authority, account mismatch, ambiguous wallets, project isolation, stable view links, participant ownership, changed wallet and no developer signing passed.')
