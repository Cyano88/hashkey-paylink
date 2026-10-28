import assert from 'node:assert/strict'
import {Keypair,Connection,Transaction,SystemProgram} from '@solana/web3.js'
import {relaySolanaTx} from '../api/relay-solana.ts'
const sponsor=Keypair.generate(),customer=Keypair.generate(),recipient=Keypair.generate()
process.env.RELAYER_PRIVATE_KEY_SOLANA=JSON.stringify([...sponsor.secretKey]);process.env.SOLANA_RPC_URL='https://fixture.invalid'
const priorSend=Connection.prototype.sendRawTransaction,priorStatus=Connection.prototype.getSignatureStatus
let broadcasts=0
Connection.prototype.sendRawTransaction=async()=>{broadcasts++;return 'fixture-hash'}
Connection.prototype.getSignatureStatus=async()=>({value:{confirmationStatus:'confirmed',err:null}})
const make=(payer,from,signers)=>{const t=new Transaction({feePayer:payer.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:from.publicKey,toPubkey:recipient.publicKey,lamports:1}));t.partialSign(...signers);return t.serialize({requireAllSignatures:false}).toString('base64')}
const call=async tx=>{const r={code:200,status(n){this.code=n;return this},json(b){this.body=b;return this}};await relaySolanaTx({body:{tx,lastValidBlockHeight:123}},r);return r}
try {
 for(const raw of [make(sponsor,sponsor,[sponsor]),make(customer,customer,[customer]),make(sponsor,customer,[sponsor])]){const r=await call(raw);assert.equal(r.code,400);assert.equal(broadcasts,0)}
 const valid=await call(make(sponsor,customer,[sponsor,customer]));assert.equal(valid.code,200);assert.equal(valid.body.txHash,'fixture-hash');assert.equal(broadcasts,1)
 console.log('PASS broadcast requires current sponsor, independent customer and complete signatures; valid signed transfer still relays. No network calls.')
}finally{Connection.prototype.sendRawTransaction=priorSend;Connection.prototype.getSignatureStatus=priorStatus}
