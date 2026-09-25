import assert from 'node:assert/strict'
import {encodeFunctionData,parseAbi} from 'viem'
import {createArcWalletHandler} from '../api/arc-wallet.ts'
const owner='0x1111111111111111111111111111111111111111',recipient='0x2222222222222222222222222222222222222222',asset='0x3600000000000000000000000000000000000000',id='11111111-1111-4111-8111-111111111111'
let project='a',allow=true,txProject='a',providerCalls=[],stores=new Map(),blockchain='ARC'
const wallet={id,address:owner,blockchain:'ARC',accountType:'SCA',state:'LIVE'}
const deps={configuration:()=>({chainId:5042,blockchain:'ARC',appId:'synthetic-app'}),hasStore:()=>true,policy:async()=>allow?{partnerId:project,merchantName:'Fixture',environment:'live',checkoutMode:'human',capabilities:['arc_agreements']}:null,read:async k=>stores.get(k),mutate:async(k,f)=>{const n=f(stores.get(k));stores.set(k,n);return n},provider:async(path,token,body)=>{providerCalls.push({path,token,body});if(path.includes('/wallets?'))return {wallets:[{...wallet,blockchain}, {...wallet,id:'test',blockchain:'ARC-TESTNET'}]};if(path.includes('/transactions?'))return {transactions:[{id,walletId:id}]};if(path.includes('/transactions/'+id))return {transaction:{id,walletId:id,blockchain:'ARC',refId:txProject+':hashpaystream-pocket:'+id,sourceAddress:owner}};return {challengeId:id}}}
const handler=createArcWalletHandler(deps)
async function call(path,method='GET',payload={},userToken='synthetic'){const res={code:200,setHeader(){},status(n){this.code=n;return this},json(b){this.body=b;return this}};await handler({method:'POST',originalUrl:'/api/v2/wallets/arc',headers:{},body:{path,method,payload,userToken}},res);return res}
const receive=await call('/receive');assert.equal(receive.body.data.wallets.length,1);assert.equal(receive.body.data.wallets[0].chainId,5042);assert.equal(receive.body.data.wallets[0].qrValue,owner);assert.equal((await call('/receive','GET',{},'')).code,401)
assert.equal((await call('/configuration')).body.data.chainId,5042)
assert.equal((await call('/v1/w3s/wallets?pageSize=50')).body.data.wallets.length,1)
assert.equal((await call('/v1/w3s/user/wallets','POST',{idempotencyKey:id,blockchains:['ARC-TESTNET'],accountType:'SCA'})).code,400)
assert.equal((await call('/v1/w3s/user/wallets','POST',{idempotencyKey:id,blockchains:['ARC'],accountType:'SCA',metadata:[{name:'injected'}]})).code,200)
assert.equal(providerCalls.at(-1).body.metadata[0].name,'Fixture Arc')
assert.notEqual(providerCalls.at(-1).body.idempotencyKey,id)
const transfer=encodeFunctionData({abi:parseAbi(['function transfer(address to,uint256 amount)']),functionName:'transfer',args:[recipient,100n]})
const batch=(target=asset,value=0n,data=transfer)=>encodeFunctionData({abi:parseAbi(['function executeBatch((address target,uint256 value,bytes data)[] calls)']),functionName:'executeBatch',args:[[{target,value,data}]]})
const payload={walletId:id,contractAddress:owner,idempotencyKey:id,refId:'hashpaystream-pocket:'+id,callData:batch()}
assert.equal((await call('/v1/w3s/user/transactions/contractExecution','POST',payload)).code,200)
assert.equal(providerCalls.at(-1).body.refId,'a:hashpaystream-pocket:'+id)
assert.equal((await call('/v1/w3s/user/transactions/contractExecution','POST',{...payload,callData:batch(recipient)})).code,400)
assert.equal((await call('/v1/w3s/user/transactions/contractExecution','POST',{...payload,callData:batch(asset,1n)})).code,400)
assert.equal((await call('/v1/w3s/user/transactions/contractExecution','POST',{...payload,contractAddress:recipient})).code,400)
blockchain='ARC-TESTNET';assert.equal((await call('/v1/w3s/user/transactions/contractExecution','POST',payload)).code,403);blockchain='ARC'
assert.equal((await call('/v1/w3s/user/sign/typedData','POST',{})).code,400)
assert.equal((await call('https://attacker.example','POST',{})).code,400)
const query='/v1/w3s/transactions?walletIds='+id+'&pageSize=5&from=2026-09-01T00%3A00%3A00Z'
let found=await call(query,'GET',{},'');assert.equal(found.body.data.transactions.length,1);assert.equal(found.body.data.transactions[0].refId,'hashpaystream-pocket:'+id)
txProject='b';assert.equal((await call(query,'GET',{},'')).body.data.transactions.length,0)
assert.equal((await call('/v1/w3s/transactions/'+id,'GET',{},'')).code,403)
project='b';const before=providerCalls.length;assert.equal((await call(query,'GET',{},'')).code,403);assert.equal(providerCalls.length,before)
allow=false;assert.equal((await call('/configuration')).code,403)
console.log('Arc hosted wallet: exact network and transfer, project recovery isolation, metadata and idempotency binding, arbitrary operations denied.')
