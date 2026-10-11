import assert from 'node:assert/strict'
import {Keypair} from '@solana/web3.js'
import {solanaReimbursementUnits,checkSolanaRelayerBalance} from '../api/pocket/solana-relayer-fees.ts'
assert.equal(solanaReimbursementUnits(10000n,10000000000n),1000n)
assert.equal(solanaReimbursementUnits(1n,10000000001n),1n)
for(const lamports of [1n,5000n,10000n,2039280n])for(const rate of [1n,10000000001n,15000000000n]){
 const raw=lamports*rate,charged=solanaReimbursementUnits(lamports,rate),denominator=100000000000n
 assert(charged*denominator>=raw);assert(charged*denominator-raw<denominator)
}
assert.throws(()=>solanaReimbursementUnits(-1n,1n));assert.throws(()=>solanaReimbursementUnits(1n,0n))
const wallet=Keypair.generate().publicKey,original=console.warn,threshold=process.env.SOLANA_RELAYER_LOW_BALANCE_LAMPORTS
let balance=100000000,warnings=[];console.warn=(...args)=>warnings.push(args)
process.env.SOLANA_RELAYER_LOW_BALANCE_LAMPORTS='50000000'
const rpc={getBalance:async()=>balance}
try{
 assert.equal((await checkSolanaRelayerBalance(rpc,wallet,10000n,0)).low,false)
 balance=1000000
 assert.equal((await checkSolanaRelayerBalance(rpc,wallet,10000n,1)).low,true)
 await checkSolanaRelayerBalance(rpc,wallet,10000n,2);assert.equal(warnings.length,1)
 await checkSolanaRelayerBalance(rpc,wallet,10000n,300001);assert.equal(warnings.length,2)
 balance=9999;await assert.rejects(()=>checkSolanaRelayerBalance(rpc,wallet,10000n,300002),e=>e.status===503)
 balance=NaN;await assert.rejects(()=>checkSolanaRelayerBalance(rpc,wallet,1n),/could not be verified/)
}finally{console.warn=original;if(threshold===undefined)delete process.env.SOLANA_RELAYER_LOW_BALANCE_LAMPORTS;else process.env.SOLANA_RELAYER_LOW_BALANCE_LAMPORTS=threshold}
console.log('PASS: exact conversion with less than one micro-token rounding; low SOL warnings throttled; insufficient or invalid balance blocks sponsorship.')
