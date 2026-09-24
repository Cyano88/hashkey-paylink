import assert from 'node:assert/strict'
import { Connection, Keypair, Transaction } from '@solana/web3.js'
import { buildSolanaTx } from '../api/relay-solana.ts'
import { SOLANA_TOKEN_PROGRAM_ID } from '../api/solana-token.ts'
const relayer=Keypair.generate(),sender=Keypair.generate(),recipient=Keypair.generate(),treasury=Keypair.generate()
process.env.RELAYER_PRIVATE_KEY_SOLANA=JSON.stringify([...relayer.secretKey])
process.env.SOLANA_RPC_URL='https://fixture.invalid'
process.env.SOLANA_TREASURY=treasury.publicKey.toBase58()
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-only-solana-quote-secret-123456789'
let balance='100000000',fee=10000,setup=false
const saved=new Map()
for(const [name,fn] of Object.entries({
 getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:12345}),
 getAccountInfo:async()=>setup?null:({owner:SOLANA_TOKEN_PROGRAM_ID}),
 getTokenAccountBalance:async()=>({value:{amount:balance}}),
 getFeeForMessage:async()=>({value:fee}),
 getMinimumBalanceForRentExemption:async()=>2039280,
})) {saved.set(name,Connection.prototype[name]);Connection.prototype[name]=fn}
const oldFetch=globalThis.fetch
globalThis.fetch=async url=>{assert.equal(new URL(url).hostname,'api.coingecko.com');return Response.json({solana:{usd:100,last_updated_at:Math.floor(Date.now()/1000)},'usd-coin':{usd:1,last_updated_at:Math.floor(Date.now()/1000)}})}
async function call(extra={}){let status=200,body;await buildSolanaTx({body:{from:sender.publicKey.toBase58(),to:recipient.publicKey.toBase58(),amount:'100',...extra}},{status(s){status=s;return this},json(b){body=b;return this}});return {status,body}}
try {
 const q=await call({quoteOnly:true});assert.equal(q.status,200);assert.equal(q.body.quote.recipientUnits,'100000000');assert.equal(q.body.quote.platformFeeUnits,'250000');assert.equal(q.body.quote.networkFeeUnits,'1000');assert.equal(q.body.quote.totalUnits,'100251000');assert.equal(q.body.tx,undefined)
 assert.equal(q.body.quote.walletAddress,sender.publicKey.toBase58(),'Solana base58 is case sensitive')
 assert.equal((await call()).status,409)
 const insufficient=await call({feeQuoteToken:q.body.token});assert.equal(insufficient.status,400);assert.match(insufficient.body.error,/lower amount/);assert.equal(insufficient.body.tx,undefined)
 balance='101000000'
 const paid=await call({feeQuoteToken:q.body.token,feeMode:'net'});assert.equal(paid.status,200);assert.equal(paid.body.recipientAmount,'100');assert.equal(paid.body.totalAmount,'100.251')
 const tx=Transaction.from(Buffer.from(paid.body.tx,'base64'));const transfers=tx.instructions.filter(x=>x.programId.equals(SOLANA_TOKEN_PROGRAM_ID));assert.equal(transfers.length,2);assert.equal(transfers[0].data.readBigUInt64LE(1),100000000n);assert.equal(transfers[1].data.readBigUInt64LE(1),251000n)
 assert.equal((await call({feeQuoteToken:q.body.token,amount:'99'})).status,409)
 fee=20000;assert.equal((await call({feeQuoteToken:q.body.token})).status,409)
 setup=true;const rent=await call({quoteOnly:true});assert.equal(rent.body.includesAccountSetup,true);assert.equal(rent.body.quote.networkFeeUnits,'409856')
 console.log('PASS: Solana RPC fee and rent quotes; case-sensitive binding; exact 100 USDC recipient; 0.25% plus gas treasury transfer; insufficient funds, absent/tampered binding and increased cost cannot produce a transaction.')
}finally{globalThis.fetch=oldFetch;for(const [name,fn] of saved)Connection.prototype[name]=fn}
