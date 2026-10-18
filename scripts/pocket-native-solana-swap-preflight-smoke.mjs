import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {AddressLookupTableAccount,Keypair,PublicKey,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js'
import {preflightNativeSolanaSwap,verifyNativeSolanaSwapSignature} from '../api/pocket/native-solana-swap-preflight.ts'
import {verifiedNativeSolanaSwapPreflight} from '../api/pocket/native-solana-swap-verified-preflight.ts'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/native-solana-swap-envelopes.json',import.meta.url)))
const policy={maximumPriorityFeeLamports:'100000',maximumNetworkFeeLamports:'200000'}
for(const {input,instructions} of fixtures){
 const own=instructions.filter(i=>i.programId!=='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'||i.accounts[2].pubkey===input.wallet)
 const addresses=[...new Set(own.flatMap(i=>i.accounts.filter(a=>!a.isSigner).map(a=>a.pubkey)))].filter(a=>a!==input.wallet).map(a=>new PublicKey(a))
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:1,lastExtendedSlotStartIndex:0,addresses}})
 let snapshotKeys=[]
 const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getMinimumBalanceForRentExemption:async()=>1855569,getAddressLookupTable:async()=>({value:table}),getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:1000}),getFeeForMessage:async()=>({value:100000}),getMultipleAccountsInfoAndContext:async keys=>{snapshotKeys=keys;return {context:{slot:100},value:keys.map(()=>null)}},simulateTransaction:async(tx,config)=>{assert.equal(config.replaceRecentBlockhash,false);assert.equal(config.minContextSlot,100);assert.deepEqual(config.accounts.addresses,snapshotKeys.map(k=>k.toBase58()));return {context:{slot:101},value:{err:null,unitsConsumed:300000,accounts:snapshotKeys.map(()=>null)}}}}
 const run=overrides=>preflightNativeSolanaSwap(input,own,[table.key.toBase58()],policy,{...rpc,...overrides})
 const result=await run({});assert.equal(result.executionAvailable,false);assert.equal(result.requiresEffectValidation,true);assert.equal(result.networkFeeLamports,'100000')
 const repeated=await preflightNativeSolanaSwap(input,own,[table.key.toBase58()],policy,{...rpc,getLatestBlockhash:async()=>{throw Error('Must keep reviewed blockhash')}},result)
 assert.equal(repeated.transaction,result.transaction)
 const mutated=structuredClone(own);const compute=mutated.find(i=>i.programId==='ComputeBudget111111111111111111111111111111'&&Buffer.from(i.data,'base64')[0]===3);const bytes=Buffer.from(compute.data,'base64');bytes.writeBigUInt64LE(1n,1);compute.data=bytes.toString('base64')
 await assert.rejects(()=>preflightNativeSolanaSwap(input,mutated,[table.key.toBase58()],policy,rpc,result))
 assert.equal((await run({getMinimumBalanceForRentExemption:async()=>1488440})).inspection.temporaryRentLamports,'1488440')
 assert.deepEqual(result.intent,input);assert.deepEqual(result.writableAddresses,result.accounts.map(a=>a.address))
 let simulations=0
 await assert.rejects(()=>verifiedNativeSolanaSwapPreflight(input,own,[table.key.toBase58()],policy,{...rpc,simulateTransaction:async(...args)=>{simulations++;return rpc.simulateTransaction(...args)}}),/estimate changed/)
 assert.equal(simulations,3)
 await assert.rejects(()=>verifiedNativeSolanaSwapPreflight(input,own,[table.key.toBase58()],policy,{...rpc,simulateTransaction:async(...args)=>{const r=await rpc.simulateTransaction(...args);r.context.slot=100;return r}}),/account changes/)
 for(const overrides of [{getGenesisHash:async()=> 'devnet'},{getMinimumBalanceForRentExemption:async()=>1},{getAddressLookupTable:async()=>({value:null})},{getFeeForMessage:async()=>({value:null})},{getFeeForMessage:async()=>({value:200001})},{simulateTransaction:async()=>({context:{slot:101},value:{err:{InstructionError:[0,'Custom']},unitsConsumed:1,accounts:[]}})},{simulateTransaction:async()=>({context:{slot:99},value:{err:null,unitsConsumed:1,accounts:[]}})}])await assert.rejects(()=>run(overrides))
 console.log('PASS',input.from+'->'+input.to,'mocked RPC network/rent/LUT/fee/simulation checks')
}
const signer=Keypair.generate(),recipient=Keypair.generate().publicKey
const make=(lamports=1)=>new VersionedTransaction(new TransactionMessage({payerKey:signer.publicKey,recentBlockhash:recipient.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:signer.publicKey,toPubkey:recipient,lamports})]}).compileToV0Message())
const approved=make(),raw=Buffer.from(approved.serialize()).toString('base64'),signed=make();signed.sign([signer])
const encode=tx=>Buffer.from(tx.serialize()).toString('base64')
verifyNativeSolanaSwapSignature(raw,encode(signed),signer.publicKey.toBase58())
assert.throws(()=>verifyNativeSolanaSwapSignature(raw,raw,signer.publicKey.toBase58()))
const changed=make(2);changed.sign([signer]);assert.throws(()=>verifyNativeSolanaSwapSignature(raw,encode(changed),signer.publicKey.toBase58()))
signed.signatures[0][0]^=1;assert.throws(()=>verifyNativeSolanaSwapSignature(raw,encode(signed),signer.publicKey.toBase58()))
assert.throws(()=>verifyNativeSolanaSwapSignature(raw,raw+' ',signer.publicKey.toBase58()))
console.log('PASS exact reviewed message binding and real Ed25519 signature verification; altered/absent signatures rejected')
