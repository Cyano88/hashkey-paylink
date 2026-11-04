import assert from 'node:assert/strict'
import {Keypair,PublicKey,Transaction} from '@solana/web3.js'
import bs58 from 'bs58'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {createCrossBridgeSolanaCost,prepareCrossBridgeSolanaTransaction,CROSS_BRIDGE_SOLANA_GENESIS} from '../api/pocket/cross-bridge-solana-transaction.ts'
import {readCrossBridgeSolanaSource,validateCrossBridgeSolanaTransaction} from '../api/pocket/cross-bridge-solana-source.ts'
import {createCrossBridgeSolanaRuntime} from '../api/pocket/cross-bridge-solana-runtime.ts'
import {SOLANA_TOKEN_PROGRAM_ID} from '../api/solana-token.ts'
const user=Keypair.fromSeed(new Uint8Array(32).fill(20)),sponsor=Keypair.fromSeed(new Uint8Array(32).fill(21)),treasury=Keypair.fromSeed(new Uint8Array(32).fill(22)).publicKey,blockhash=Keypair.fromSeed(new Uint8Array(32).fill(23)).publicKey.toBase58(),secret='solana-cross-test-secret'.repeat(3)
for(const asset of ['USDC','USDT']){
 const {q,i}=fixture('solana','base',asset,'ETH',false,user.publicKey.toBase58()),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:'solana',provider:'circle',walletId:'solana-wallet',address:i.sender},destination:{network:'base',provider:'circle',walletId:'dest',address:i.recipient}};wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const charged=await buildCrossBridgeChargedPlan(route,wallets,123n,treasury.toBase58()),saved=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:treasury.toBase58(),...charged,expiresAt:now+30000},{secret,now}),review=await openCrossBridgeReview(saved.quoteToken,'owner',{secret,now})
 const plan=charged.plan,source=plan.instructions[0].keys[5].pubkey,vault=plan.instructions[0].keys[6].pubkey,feeAccount=plan.instructions[1].keys[2].pubkey,vaultOwner=plan.instructions[0].keys[3].pubkey,mint=new PublicKey(route.tokenIn.address),held=10000000n
 const account=(owner,amount)=>{const data=Buffer.alloc(165);mint.toBuffer().copy(data);owner.toBuffer().copy(data,32);data.writeBigUInt64LE(amount,64);data[108]=1;return {data,owner:SOLANA_TOKEN_PROGRAM_ID,lamports:2039280,executable:false}}
 const info=(key)=>key.equals(user.publicKey)?{data:Buffer.alloc(0),owner:PublicKey.default,lamports:100000,executable:false}:key.equals(source)?account(user.publicKey,held):key.equals(vault)?account(vaultOwner,100n):account(treasury,50n)
 let badRent=false,missing=false
 const rpc={getGenesisHash:async()=>CROSS_BRIDGE_SOLANA_GENESIS,getAccountInfo:async key=>info(key),getMultipleAccountsInfo:async keys=>keys.map(key=>missing&&key.equals(vault)?null:info(key)),getLatestBlockhash:async()=>({blockhash,lastValidBlockHeight:100}),getFeeForMessage:async()=>({value:10000}),getBalance:async()=>1000000000,
 simulateTransaction:async()=>({value:{err:null,accounts:[{...info(user.publicKey),lamports:badRent?99999:100000},account(user.publicKey,held-charged.totalUnits),account(vaultOwner,100n+BigInt(i.amountUnits)),account(treasury,173n)].map(a=>({...a,owner:a.owner.toBase58(),data:[a.data.toString('base64'),'base64']}))}})}
 const cost=createCrossBridgeSolanaCost(wallets,asset,rpc,sponsor.publicKey,{now:()=>now,prices:async()=>({gasPrice:{scaled8:100000000n,observedAt:now},assetPrice:{scaled8:100000000n,observedAt:now}})})
 assert.equal(await cost.balance(),held);assert.equal((await cost.estimate(charged.plan,charged.planHash)).rentUnits,0n)
 missing=true;await assert.rejects(()=>cost.estimate(charged.plan,charged.planHash));missing=false
 const options={now:()=>now,running:async()=>{}}
 const prepared=await prepareCrossBridgeSolanaTransaction(review,rpc,sponsor,options)
 badRent=true;await assert.rejects(()=>prepareCrossBridgeSolanaTransaction(review,rpc,sponsor,options));badRent=false
 const signed=Transaction.from(Buffer.from(prepared.transaction,'base64'));signed.partialSign(user);const raw=signed.serialize().toString('base64'),hash=bs58.encode(signed.signature)
 validateCrossBridgeSolanaTransaction(review,prepared.transaction,raw,true)
 const changed=Transaction.from(Buffer.from(raw,'base64'));changed.recentBlockhash=treasury.toBase58();changed.partialSign(user,sponsor);assert.throws(()=>validateCrossBridgeSolanaTransaction(review,prepared.transaction,changed.serialize().toString('base64'),true))
 const message=signed.compileMessage(),keys=message.accountKeys,index=address=>keys.findIndex(k=>k.equals(address))
 const row=(address,owner,amount)=>({accountIndex:index(address),owner:owner.toBase58(),mint:mint.toBase58(),uiTokenAmount:{amount:String(amount),decimals:6,uiAmount:null}})
 let badFee=false,failed=false
 const receipt=()=>({slot:10,transaction:{message,signatures:[hash,bs58.encode(signed.signatures[1].signature)]},meta:{err:failed?{InstructionError:[0,'Custom']}:null,preBalances:keys.map(()=>100000),postBalances:keys.map(()=>100000),preTokenBalances:[row(source,user.publicKey,held),row(vault,vaultOwner,100n),row(feeAccount,treasury,50n)],postTokenBalances:[row(source,user.publicKey,held-charged.totalUnits),row(vault,vaultOwner,100n+BigInt(i.amountUnits)),row(feeAccount,treasury,badFee?172n:173n)]}})
 const evidence={getGenesisHash:rpc.getGenesisHash,getTransaction:async()=>receipt(),getSlot:async()=>10,getBlockSignatures:async()=>({blockhash,signatures:[hash]})}
 assert.equal(await readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence),'confirmed');badFee=true;await assert.rejects(()=>readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence));badFee=false;failed=true;assert.equal(await readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence),'failed');failed=false
 let time=now,rows=new Map(),challenges=0,broadcasts=0,observed=false
 const store={read:async id=>structuredClone(rows.get(id)),mutate:async(id,fn)=>{const next=fn(structuredClone(rows.get(id)));rows.set(id,next);return structuredClone(next)}}
 const runtime=createCrossBridgeSolanaRuntime('owner','ephemeral-user-token',async()=>{}, {store,durable:()=>true,now:()=>time,open:(token,owner,o)=>openCrossBridgeReview(token,owner,{...o,secret}),wallets:async()=>{},approve:async()=>true,prepare:async()=>prepared,challenge:async()=>{challenges++;return {challengeId:'11111111-1111-4111-8111-111111111111'}},rpc:()=>({getGenesisHash:rpc.getGenesisHash,getBlockHeight:async()=>50,getSignatureStatuses:async()=>({value:[observed?{confirmationStatus:'confirmed',err:null}:null]}),sendRawTransaction:async bytes=>{broadcasts++;assert.equal(bytes.toString('base64'),raw);assert.equal(rows.get(saved.quote.id).signedTransaction,raw);return hash}})})
 await runtime.prepare(saved.quoteToken,'pin');await runtime.submit(saved.quote.id);await runtime.submit(saved.quote.id);assert.equal(challenges,1)
 time+=90000;await runtime.signed(saved.quote.id,raw);assert.equal(broadcasts,1);assert.equal(rows.get(saved.quote.id).sourceHash,hash)
 await runtime.status(saved.quote.id);assert.equal(broadcasts,1);observed=true;await runtime.broadcast(saved.quote.id);assert.equal(broadcasts,1)
 assert.equal((await runtime.cancel(saved.quote.id)).state,'submitted');assert(!JSON.stringify([...rows]).includes('ephemeral-user-token'))
}
console.log('PASS Solana USDC/USDT: pre-existing ATA/rent checks, simulated exact debit and fee, sponsor funding, message/signature binding, finalized source evidence, failure proof, durable signed bytes before broadcast and restart tracking. Synthetic RPC; no money moved.')
