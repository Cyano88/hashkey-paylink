import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {REQUEST_ASSETS,requestNetworks,requestAsset,requestAmountUnits} from '../src/pocket/lib/pocketRequestAssets.ts'
import {requestEvmUnits,requestSolanaUnits,verifyRequestTransfer} from '../api/pocket/request-transfer-proof.ts'
import {createPocketRequestRepository} from '../api/pocket/request-store.ts'
import {createPocketRequestsHandler} from '../api/pocket/requests.ts'
const root=await mkdtemp(join(tmpdir(),'pocket-multi-request-')),from='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),hash='0x'+'a'.repeat(64)
const topic='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',addressTopic=a=>'0x'+a.slice(2).padStart(64,'0')
let proofCalls=0
const repository=createPocketRequestRepository({durable:false,isRender:false,storePath:join(root,'requests.json')})
const profile=id=>({privyUserId:id,pocketId:id==='owner'?'11111111':'22222222',email:id+'@example.com',nameStatus:'unverified'})
const handler=createPocketRequestsHandler({repository,eurcEnabled:()=>true,nativeEnabled:()=>true,solEnabled:()=>true,verifyUser:async req=>({userId:req.headers.user}),profiles:{ensure:async id=>({profile:profile(id.userId)}),getByPocketId:async()=>profile('payer')},readEmbeddedWallet:async id=>id==='owner'?to:from,readWallet:async key=>({circleWalletAddress:key.includes('solana')?'11111111111111111111111111111111':key.startsWith('owner')?to:from}),verifyAsset:async p=>{assert.equal(p.recipient,to);assert.equal(p.payer,from);assert.equal(p.txHash,hash);proofCalls++;return true}})
async function call(user,body,query={},multi=true){const res={statusCode:200,setHeader(){},status(n){this.statusCode=n;return this},json(body){this.body=body;return this}};await handler({method:Object.keys(query).length?'GET':'POST',body,query,headers:{user,'x-pocket-request-assets':multi?'1':undefined}},res);return res}
try{
 let sequence=0
 for(const asset of REQUEST_ASSETS)for(const network of requestNetworks(asset)){
  const token=requestAsset(network,asset),amount='0.'+'0'.repeat(token.decimals-1)+'1',units=requestAmountUnits(amount,network,asset)
  assert.equal(units,1n);assert.throws(()=>requestAmountUnits(amount+'1',network,asset));assert.throws(()=>requestAmountUnits('-1',network,asset))
  for(const action of ['create','create-link']){
   const created=await call('owner',{action,recipientPocketId:'22222222',asset,network,amount,eventId:'multi-request-'+(++sequence),title:'Test'})
   assert.equal(created.statusCode,201,JSON.stringify(created.body));assert.equal(created.body.request.asset,asset);assert.equal(created.body.request.network,network);assert.equal(created.body.request.amount,amount)
   if(action==='create-link'){const code=created.body.request.linkUrl.split('/').at(-1),preview=await call('',{}, {link:code});assert.equal(preview.body.preview.asset,asset);assert.equal(preview.body.preview.recipientAddress,undefined);const claimed=await call('payer',{action:'claim-link',code});assert.equal(claimed.body.request.asset,asset)}
  }
  if(network==='solana')continue
  const p={network,asset,amount,payer:from,recipient:to,txHash:hash,notBefore:1000},trace={type:'CALL',from,to,value:'0x1',calls:[]}
  const emitter=network==='arc'?'0xfffffffffffffffffffffffffffffffffffffffe':token.address
  const receipt={logs:[{address:emitter,topics:[topic,addressTopic(from),addressTopic(to)],data:'0x'+(network==='arc'?10n**12n:1n).toString(16)}]}
  assert.equal(requestEvmUnits(p,receipt,trace),network==='arc'?10n**12n:1n)
  if(token.address==='native'){assert.equal(requestEvmUnits(p,receipt,{...trace,error:'reverted'}),0n);assert.equal(requestEvmUnits(p,receipt,{type:'CALL',error:'reverted',calls:[trace]}),0n);assert.equal(requestEvmUnits(p,receipt,{...trace,from:to}),0n)}
  else{assert.equal(requestEvmUnits(p,{logs:[{...receipt.logs[0],address:from}]}),0n);assert.equal(requestEvmUnits({...p,recipient:from},receipt),0n)}
 }
 assert.equal((await call('owner',{action:'create-link',asset:'USDT',network:'base',amount:'1',eventId:'old-client-test-01'},{},false)).statusCode,409)
 assert.equal((await call('owner',{action:'create-link',asset:'ETH',network:'solana',amount:'1',eventId:'bad-asset-0001'})).statusCode,400)
 assert.equal((await call('owner',{action:'create-link',asset:'USDT',network:'arc',amount:'1',eventId:'bad-asset-0002'})).statusCode,400)
 const created=await call('owner',{action:'create',recipientPocketId:'22222222',asset:'USDe',network:'xlayer',amount:'1.000000000000000001',eventId:'proof-integration-01'});await call('payer',{action:'accept',id:created.body.request.id});const paid=await call('payer',{action:'complete',id:created.body.request.id,transactionHash:hash});assert.equal(paid.body.request.status,'paid');assert.equal(proofCalls,1)
 const p={asset:'ETH',network:'base',amount:'0.000000000000000001',payer:from,recipient:to,txHash:hash,notBefore:1000}
 let wrongChain=false,stale=false,reverted=false,wrongAmount=false
 const rpc=async(_n,m)=>m==='eth_chainId'?(wrongChain?'0x1':'0x2105'):m==='eth_getTransactionReceipt'?{status:reverted?'0x0':'0x1',transactionHash:hash,blockHash:'0xblock',blockNumber:'0x1'}:m==='eth_getBlockByNumber'?{hash:'0xblock',timestamp:stale?'0x0':'0x2'}:{type:'CALL',from,to,value:wrongAmount?'0x2':'0x1'}
 await verifyRequestTransfer(p,{rpc});wrongChain=true;await assert.rejects(()=>verifyRequestTransfer(p,{rpc}));wrongChain=false;stale=true;await assert.rejects(()=>verifyRequestTransfer({...p,notBefore:5000},{rpc}));stale=false;reverted=true;await assert.rejects(()=>verifyRequestTransfer(p,{rpc}));reverted=false;wrongAmount=true;await assert.rejects(()=>verifyRequestTransfer(p,{rpc}))
 const sol={network:'solana',asset:'USDT',amount:'1',payer:'payer',recipient:'receiver',txHash:'x',notBefore:0},mint=requestAsset('solana','USDT').address
 const tx={transaction:{message:{accountKeys:['source','dest'],instructions:[{programId:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',parsed:{type:'transferChecked',info:{source:'source',destination:'dest',authority:'payer',mint,tokenAmount:{amount:'1000000',decimals:6}}}}]}},meta:{preTokenBalances:[{accountIndex:0,mint,owner:'payer'}],postTokenBalances:[{accountIndex:1,mint,owner:'receiver'}]}}
 assert.equal(requestSolanaUnits(sol,tx),1000000n);tx.transaction.message.instructions[0].parsed.info.mint='wrong';assert.equal(requestSolanaUnits(sol,tx),0n)
 console.log('PASS multi-asset requests: '+sequence+' ID/link combinations, exact precision, private previews, X Layer proof binding, wrong token/network/amount, reverted calls, stale transfers and Solana mint checks')
}finally{await rm(root,{recursive:true,force:true})}
