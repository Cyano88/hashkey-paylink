import assert from 'node:assert/strict'
import {Keypair,Transaction,SystemProgram,PublicKey} from '@solana/web3.js'
import {quoteNativeSolana,sealNativeSolana,openNativeSolana,solAmountUnits,validateNativeSolanaTransaction} from '../api/pocket/native-solana-send-quote.ts'
import {createNativeSolanaSendHandler} from '../api/pocket/native-solana-send.ts'
process.env.POCKET_SWAP_QUOTE_SECRET='sol-native-send-fixture-secret-'.repeat(3)
const signer=Keypair.generate(),receiver=Keypair.generate(),address=signer.publicKey.toBase58(),recipient=receiver.publicKey.toBase58(),blockhash=Keypair.generate().publicKey.toBase58(),owner='owner-a'
let existing=null,approval=true,challenged=0,broadcasts=0,height=50,receipt=null,failBroadcast=false
const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getLatestBlockhash:async()=>({blockhash,lastValidBlockHeight:100}),getFeeForMessage:async()=>({value:5000}),getBalance:async()=>1000000000,getBlockHeight:async()=>height,getTransaction:async()=>receipt,getSignatureStatuses:async()=>({value:[null]}),sendRawTransaction:async raw=>{assert.ok(existing.metadata.signedTransaction);assert.ok(existing.metadata.txHash);broadcasts++;if(failBroadcast)throw Error('timeout');return existing.metadata.txHash}}
const q=await quoteNativeSolana({ownerId:owner,walletId:'wallet',walletAddress:address,recipient,amount:'0.012345678'},rpc),token=sealNativeSolana(q)
assert.equal(q.amountUnits,'12345678');assert.equal(q.totalUnits,'12350678');assert.deepEqual(openNativeSolana(token,owner),q)
assert.throws(()=>openNativeSolana(token,'owner-b'));for(const value of ['0','-1','1e-3','0.0000000001','01','10000000000'])assert.throws(()=>solAmountUnits(value))
const tx=Transaction.from(Buffer.from(q.transaction,'base64'));tx.sign(signer);const raw=tx.serialize().toString('base64');assert.ok(validateNativeSolanaTransaction(q,raw,true).signature)
const bad=Transaction.from(Buffer.from(q.transaction,'base64'));bad.add(SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:receiver.publicKey,lamports:1}));bad.sign(signer);assert.throws(()=>validateNativeSolanaTransaction(q,bad.serialize().toString('base64'),true));assert.throws(()=>validateNativeSolanaTransaction(q,q.transaction,true))
const deps={identity:async()=>({userId:owner}),readLink:async()=>({privyUserId:owner,chain:'solana',purpose:'payment',circleBlockchain:'SOL',circleWalletId:'wallet',circleWalletAddress:address}),enabled:()=>true,rpc:()=>rpc,approval:async()=>approval,find:async()=>existing,list:async()=>existing?[existing]:[],claim:async input=>{if(existing)return{claimed:false,record:existing};existing={...input,status:'started'};return{claimed:true,record:existing}},record:async input=>{existing=input;return input},challenge:async()=>{assert.equal(existing.status,'started');challenged++;return{challengeId:'challenge'}}}
const handler=createNativeSolanaSendHandler(deps)
async function call(body,method='POST'){let status=200,data;await handler({method,body,headers:{}},{setHeader(){},status(s){status=s;return this},json(b){data=b;return this}});return{status,data}}
approval=false;assert.equal((await call({action:'execute',quoteToken:token})).status,403);assert.equal(challenged,0);approval=true
assert.equal((await call({action:'execute',quoteToken:token})).data.challengeId,'challenge');await call({action:'execute',quoteToken:token});assert.equal(challenged,1)
assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:bad.serialize().toString('base64')})).status,409);assert.equal(broadcasts,0)
failBroadcast=true;assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:raw})).status,503);assert.equal(broadcasts,1);assert.ok(existing.metadata.txHash)
failBroadcast=false;assert.equal((await call({action:'status',quoteToken:token})).data.status,'pending');assert.equal(broadcasts,2)
receipt={meta:{err:null,fee:5000},transaction:{message:tx.compileMessage()}};assert.equal((await call({action:'status',quoteToken:token})).data.status,'completed');assert.equal(existing.status,'completed')
receipt=null;existing={...existing,status:'submitted',metadata:{...existing.metadata,txHash:undefined,signedTransaction:undefined}};height=101;assert.equal((await call({action:'status',quoteToken:token})).data.status,'failed')
existing=null;height=50;await call({action:'execute',quoteToken:token});const beforeCancelBroadcasts=broadcasts;assert.equal((await call({action:'cancel',quoteToken:token})).data.status,'not_submitted');assert.equal((await call({action:'submit',quoteToken:token,signedTransaction:raw})).data.status,'not_submitted');assert.equal(broadcasts,beforeCancelBroadcasts)
console.log('PASS SOL exact lamports, fee payer, owner/signature/message binding, extra instruction rejection, PIN, durable signed bytes before broadcast, safe rebroadcast and expired blockhash recovery')
