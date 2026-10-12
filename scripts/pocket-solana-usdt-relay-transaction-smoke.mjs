import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Keypair,PublicKey,Transaction} from '@solana/web3.js'
import {SOLANA_TOKEN_PROGRAM_ID} from '../api/solana-token.ts'
import {prepareSolanaUsdtRelayTransaction} from '../api/pocket/solana-usdt-relay-transaction.ts'
const fixture=JSON.parse(readFileSync(new URL('./fixtures/relay-usdt/relay-solana-base.json',import.meta.url),'utf8'))
const quote=fixture.response,route={source:'solana',destination:'base',sender:fixture.request.user,recipient:fixture.request.recipient,amountUnits:fixture.request.amount}
const relayer=Keypair.generate(),treasury=Keypair.generate().publicKey
let balance=1000000000000n,missing=false,sponsor=1000000000
const connection={
 getAccountInfo:async()=>missing?null:{owner:SOLANA_TOKEN_PROGRAM_ID},
 getTokenAccountBalance:async()=>({value:{amount:String(balance)}}),
 getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:1000}),
 getFeeForMessage:async(message)=>{assert.equal(message.header.numRequiredSignatures,2);return {value:10000}},
 getBalance:async()=>sponsor,
}
const input={quote,route,connection,relayer,treasury,now:(quote.protocol.v2.orderData.output.deadline-7*86400)*1000,readRate:async()=>15000000000n}
const result=await prepareSolanaUsdtRelayTransaction(input)
assert.equal(result.networkFeeUnits,'1500');assert.equal(result.appFeeUnits,'0')
assert.equal(BigInt(result.totalUnits),BigInt(route.amountUnits)+1500n)
const tx=Transaction.from(Buffer.from(result.transaction,'base64'))
assert.equal(tx.instructions.length,2);assert.equal(tx.instructions[1].data.readBigUInt64LE(1),1500n)
assert.equal(tx.feePayer.toBase58(),relayer.publicKey.toBase58());assert.equal(tx.verifySignatures(false),true)
assert.equal(tx.signatures.find(s=>s.publicKey.equals(new PublicKey(route.sender))).signature,null)
balance=1n;await assert.rejects(()=>prepareSolanaUsdtRelayTransaction(input),/Insufficient/)
balance=1000000000000n;missing=true;await assert.rejects(()=>prepareSolanaUsdtRelayTransaction(input),/provisioned/)
missing=false;sponsor=1;await assert.rejects(()=>prepareSolanaUsdtRelayTransaction(input),/temporarily unavailable/)
console.log('Solana Relay transaction tests passed: exact USDT fee recovery, no platform fee, partial signature, insufficient funds and missing token accounts. No broadcast.')
