import assert from 'node:assert/strict'
import {PublicKey} from '@solana/web3.js'
import {verifyParsedSolanaUsdcTransfer} from '../api/solana-usdc-transfer-verify.ts'
const key=n=>new PublicKey(new Uint8Array(32).fill(n)),payer=key(1).toBase58(),recipient=key(2).toBase58()
const mint='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const balance=(accountIndex,owner)=>({accountIndex,owner,mint,uiTokenAmount:{amount:'1000000',decimals:6}})
const instruction={programId:new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),parsed:{type:'transferChecked',info:{authority:payer,source:key(3).toBase58(),destination:key(4).toBase58(),mint,tokenAmount:{amount:'1000000',decimals:6}}}}
const fixture=()=>({transaction:{message:{accountKeys:[{pubkey:key(1),signer:true},{pubkey:key(3),signer:false},{pubkey:key(4),signer:false}],instructions:[structuredClone(instruction)]}},meta:{err:null,preTokenBalances:[balance(1,payer)],postTokenBalances:[balance(1,payer),balance(2,recipient)],innerInstructions:[]}})
// PublicKey prototypes are intentionally retained in RPC-shaped fixtures.
function tx(){const value=fixture();value.transaction.message.instructions=[{...instruction,parsed:structuredClone(instruction.parsed)}];return value}
const input={payer,recipient,minAmount:'1'}
assert.equal(verifyParsedSolanaUsdcTransfer(tx(),input).units,1000000n)
for(const mutate of [t=>{t.meta.err={failed:true}},t=>{t.transaction.message.accountKeys[0].signer=false},t=>{t.transaction.message.instructions[0].parsed.info.authority=recipient},t=>{t.meta.postTokenBalances[1].owner=payer},t=>{t.transaction.message.instructions[0].parsed.info.tokenAmount.amount='999999'},t=>{t.transaction.message.instructions[0].parsed.info.mint=key(5).toBase58()},t=>{t.transaction.message.instructions[0].programId=key(5)}]){const value=tx();mutate(value);assert.throws(()=>verifyParsedSolanaUsdcTransfer(value,input))}
const inner=tx();inner.meta.innerInstructions=[{index:0,instructions:inner.transaction.message.instructions}];inner.transaction.message.instructions=[];assert.equal(verifyParsedSolanaUsdcTransfer(inner,input).units,1000000n)
assert.throws(()=>verifyParsedSolanaUsdcTransfer(null,input))
assert.throws(()=>verifyParsedSolanaUsdcTransfer(tx(),{...input,recipient:payer}))
console.log('PASS Solana USDC receipt: exact mint, token program, signer, authority, recipient, integer amount, inner transfer and new recipient token account; invalid proof fails closed.')
