import assert from 'node:assert/strict';
import {Keypair,Connection,Transaction,SystemProgram} from '@solana/web3.js';
import {buildSolanaTx,validatePocketSignedSolanaTransaction} from '../api/relay-solana.ts';
const sponsor=Keypair.generate(),recipient=Keypair.generate();
process.env.RELAYER_PRIVATE_KEY_SOLANA=JSON.stringify([...sponsor.secretKey]);
process.env.SOLANA_RPC_URL='http://127.0.0.1:1';
let rpcCalls=0;const original=Connection.prototype.getLatestBlockhash;
Connection.prototype.getLatestBlockhash=async()=>{rpcCalls++;throw Error('Fixture RPC must not be reached')};
try{for(const mode of ['send','withdraw',undefined])for(const asset of ['USDC','USDT'])for(const quoteOnly of [true,false]){let status=200,body;const res={status(s){status=s;return this},json(v){body=v;return this}};await buildSolanaTx({body:{from:sponsor.publicKey.toBase58(),to:recipient.publicKey.toBase58(),amount:'1',mode,asset,quoteOnly}},res);assert.equal(body.ok,false);assert.equal(rpcCalls,0,'reject sponsor as source before RPC/signing');assert.equal(status,403);assert.equal(body.tx,undefined)}
const tx=new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:sponsor.publicKey,toPubkey:recipient.publicKey,lamports:1}));tx.sign(sponsor);assert.throws(()=>validatePocketSignedSolanaTransaction({tx:tx.serialize().toString('base64'),requiredSigner:sponsor.publicKey.toBase58()}),/relayer|sender|signer/i);
const user=Keypair.generate();const ordinary=new Transaction({feePayer:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:user.publicKey,toPubkey:recipient.publicKey,lamports:1}));ordinary.sign(user,sponsor);assert.doesNotThrow(()=>validatePocketSignedSolanaTransaction({tx:ordinary.serialize().toString('base64'),requiredSigner:user.publicKey.toBase58()}));
console.log('PASS relayer cannot be customer sender in quote/build modes or linked signer; independent user signature still accepted');}finally{Connection.prototype.getLatestBlockhash=original}
