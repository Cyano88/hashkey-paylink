import assert from 'node:assert/strict'
import {verifyCircleSolanaSigningWallet} from '../api/circle-solana-email.ts'
process.env.CIRCLE_SOLANA_BLOCKCHAIN='SOL'
const wallet={id:'selected-wallet',address:'11111111111111111111111111111111',blockchain:'SOL',state:'LIVE'}
const input={userToken:'fixture',walletId:wallet.id,walletAddress:wallet.address}
let calls=0
assert.deepEqual(await verifyCircleSolanaSigningWallet(input,async(token,chain,id)=>{calls++;assert.equal(token,'fixture');assert.equal(chain,'solana');assert.equal(id,wallet.id);return wallet}),wallet)
assert.equal(calls,1)
for(const w of [null,{...wallet,id:'other'},{...wallet,blockchain:'SOL-DEVNET'},{...wallet,state:'FROZEN'},{...wallet,address:'0x'+'1'.repeat(40)}])await assert.rejects(()=>verifyCircleSolanaSigningWallet(input,async()=>w),/Reconnect/)
await assert.rejects(()=>verifyCircleSolanaSigningWallet({...input,walletAddress:'different'},async()=>wallet),/Reconnect/)
await assert.rejects(()=>verifyCircleSolanaSigningWallet(input,async()=>{throw Error('Unauthorized')}),/Unauthorized/)
console.log('PASS exact Solana wallet lookup, chain, address, state and authorization checks; no list-page dependency.')
