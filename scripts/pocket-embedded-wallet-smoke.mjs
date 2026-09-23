import assert from 'node:assert/strict'
import {ensurePocketEmbeddedWallet,pocketEmbeddedAddresses,retryPocketEmbeddedWallet} from '../src/pocket/lib/pocketEmbeddedWallet.ts'
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40)
const embedded={type:'wallet',chainType:'ethereum',walletClientType:'privy',address}
assert.deepEqual(pocketEmbeddedAddresses({linkedAccounts:[embedded,embedded,{...embedded,chainType:'solana'},{...embedded,walletClientType:'external'},{...embedded,address:'invalid'}]}),[address])
let count=0,resolve
const create=()=>{count++;return new Promise(r=>resolve=r)}
const a=ensurePocketEmbeddedWallet('new-owner',create),b=ensurePocketEmbeddedWallet('new-owner',create)
await Promise.resolve();assert.equal(count,1);assert.equal(a,b);resolve({address});assert.equal(await a,address);assert.equal(await ensurePocketEmbeddedWallet('new-owner',create),address);assert.equal(count,1)
assert.equal(await ensurePocketEmbeddedWallet('other-owner',async()=>({address:other})),other)
await assert.rejects(ensurePocketEmbeddedWallet('',create),/Sign in/)
let failures=0;const fail=()=>{failures++;throw Error('provider unavailable')}
await assert.rejects(ensurePocketEmbeddedWallet('retry-owner',fail),/unavailable/)
await assert.rejects(ensurePocketEmbeddedWallet('retry-owner',fail),/unavailable/);assert.equal(failures,1)
assert.equal(await retryPocketEmbeddedWallet('retry-owner',async()=>({address})),address)
console.log('PASS: unique embedded identity, concurrent initialization dedupe, account isolation, no automatic retry loops, explicit recovery.')
