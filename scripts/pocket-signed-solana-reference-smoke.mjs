import assert from 'node:assert/strict'
import {Keypair,SystemProgram,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {signedSolanaReference} from '../src/pocket/lib/pocketSignedSolanaReference.ts'
const fee=Keypair.generate(),payer=Keypair.generate(),recipient=Keypair.generate()
const tx=new Transaction({feePayer:fee.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58()}).add(SystemProgram.transfer({fromPubkey:payer.publicKey,toPubkey:recipient.publicKey,lamports:1}))
tx.partialSign(fee)
assert.throws(()=>signedSolanaReference(tx.serialize({requireAllSignatures:false}).toString('base64')))
tx.partialSign(payer)
assert.equal(signedSolanaReference(tx.serialize().toString('base64')),bs58.encode(tx.signature))
console.log('PASS fully authorized Solana reference is known before broadcast; incomplete signatures rejected')
