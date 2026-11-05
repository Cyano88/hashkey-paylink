import assert from 'node:assert/strict'
import {Keypair,PublicKey,Transaction,SystemProgram} from '@solana/web3.js'
import bs58 from 'bs58'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview,openCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {createCrossBridgeSolanaCost,prepareCrossBridgeSolanaTransaction,CROSS_BRIDGE_SOLANA_GENESIS} from '../api/pocket/cross-bridge-solana-transaction.ts'
import {readCrossBridgeSolanaSource,validateCrossBridgeSolanaTransaction} from '../api/pocket/cross-bridge-solana-source.ts'
import {readSolanaBridgeDelivery,solanaBridgeNativeDelta} from '../api/pocket/bridge-solana-delivery.ts'
const user=Keypair.fromSeed(new Uint8Array(32).fill(20)),sponsor=Keypair.fromSeed(new Uint8Array(32).fill(21)),other=Keypair.fromSeed(new Uint8Array(32).fill(22)).publicKey,blockhash=Keypair.fromSeed(new Uint8Array(32).fill(23)).publicKey.toBase58(),secret='sol-native-bridge-fixture-'.repeat(3)
for(const [sharedFeePayer,newTreasury] of [[false,false],[true,false],[false,true]]){
 const reimbursement=newTreasury?900880n:20000n
 const treasury=sharedFeePayer?sponsor.publicKey:other
 const {q,i}=fixture('solana','bsc','SOL','BNB',false,user.publicKey.toBase58()),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:'solana',provider:'circle',walletId:'source',address:i.sender},destination:{network:'bsc',provider:'privy',walletId:'destination',address:i.recipient}};wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const charged=await buildCrossBridgeChargedPlan(route,wallets,reimbursement,treasury.toBase58()),saved=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:reimbursement,reimbursementRecipient:treasury.toBase58(),...charged,expiresAt:now+30000},{secret,now}),review=await openCrossBridgeReview(saved.quoteToken,'owner',{secret,now})
 const vault=charged.plan.instructions[0].keys[3].pubkey,held=10000000000
 const delta=key=>(key.equals(user.publicKey)?-charged.totalUnits:0n)+(key.equals(vault)?BigInt(i.amountUnits):0n)+(key.equals(treasury)?reimbursement:0n)-(key.equals(sponsor.publicKey)?10000n:0n)
 const initial=key=>newTreasury&&key.equals(treasury)?0:held
 const info=()=>({data:Buffer.alloc(0),owner:SystemProgram.programId,lamports:held,executable:false})
 let badSimulation=false,badProof=false,failed=false
 const rpc={getGenesisHash:async()=>CROSS_BRIDGE_SOLANA_GENESIS,getAccountInfo:async()=>info(),getMultipleAccountsInfo:async keys=>keys.map(key=>newTreasury&&key.equals(treasury)?null:info()),getBalance:async()=>held,getMinimumBalanceForRentExemption:async()=>890880,getLatestBlockhash:async()=>({blockhash,lastValidBlockHeight:100}),getFeeForMessage:async()=>({value:10000}),simulateTransaction:async(_tx,options)=>({value:{err:null,accounts:options.accounts.addresses.map((address,index)=>({...info(),owner:SystemProgram.programId.toBase58(),data:['','base64'],lamports:initial(new PublicKey(address))+Number(delta(new PublicKey(address)))+(badSimulation&&index===0?1:0)}))}})}
 const cost=createCrossBridgeSolanaCost(wallets,'SOL',rpc,sponsor.publicKey,{now:()=>now,prices:async()=>({gasPrice:{scaled8:100000000n,observedAt:now},assetPrice:{scaled8:100000000n,observedAt:now}})})
 assert.equal(await cost.balance(),BigInt(held));assert.equal((await cost.estimate(charged.plan,charged.planHash)).rentUnits,newTreasury?890880n:0n)
 const prepared=await prepareCrossBridgeSolanaTransaction(review,rpc,sponsor,{now:()=>now,running:async()=>{}})
 badSimulation=true;await assert.rejects(()=>prepareCrossBridgeSolanaTransaction(review,rpc,sponsor,{now:()=>now,running:async()=>{}}));badSimulation=false
 const signed=Transaction.from(Buffer.from(prepared.transaction,'base64'));signed.partialSign(user);const raw=signed.serialize().toString('base64'),hash=bs58.encode(signed.signature)
 validateCrossBridgeSolanaTransaction(review,prepared.transaction,raw,true)
 const message=signed.compileMessage(),keys=message.accountKeys
 const receipt=()=>({slot:10,transaction:{message,signatures:[hash,bs58.encode(signed.signatures[1].signature)]},meta:{err:failed?{InstructionError:[0,'Custom']}:null,fee:10000,preBalances:keys.map(initial),postBalances:keys.map(k=>initial(k)+Number(delta(k))+(badProof&&k.equals(treasury)?1:0)),preTokenBalances:[],postTokenBalances:[]}})
 const evidence={getGenesisHash:rpc.getGenesisHash,getTransaction:async()=>receipt(),getSlot:async()=>10,getBlockSignatures:async()=>({blockhash,signatures:[hash]})}
 assert.equal(await readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence),'confirmed');badProof=true;await assert.rejects(()=>readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence));badProof=false;failed=true;assert.equal(await readCrossBridgeSolanaSource(review,hash,prepared.transaction,raw,evidence),'failed')
 const delivery={slot:10,transaction:{signatures:[hash],message:{accountKeys:[{pubkey:sponsor.publicKey,signer:true},{pubkey:user.publicKey,signer:false}]}},meta:{err:null,preBalances:[held,held],postBalances:[held-10000,held+100000],fee:10000,preTokenBalances:[],postTokenBalances:[]}}
 assert.equal(solanaBridgeNativeDelta(delivery,user.publicKey.toBase58(),hash),100000n);assert.equal(solanaBridgeNativeDelta(delivery,sponsor.publicKey.toBase58(),hash),null)
 const read={getGenesisHash:rpc.getGenesisHash,getParsedTransaction:async()=>delivery,getSlot:async()=>10,getBlockSignatures:evidence.getBlockSignatures}
 assert.equal(await readSolanaBridgeDelivery('SOL',user.publicKey.toBase58(),hash,read),100000n)
 const malformed=structuredClone(delivery);malformed.meta.postBalances[1]=Number.MAX_SAFE_INTEGER+1;assert.equal(solanaBridgeNativeDelta(malformed,user.publicKey.toBase58(),hash),null)
 let reads=0;{const result=await readSolanaBridgeDelivery('SOL',user.publicKey.toBase58(),hash,{...read,getParsedTransaction:async()=>{reads++;return reads===1?delivery:{...delivery,meta:{...delivery.meta,postBalances:[held-10000,held+100001]}}}});assert.equal(result,null)}
}
console.log('PASS native SOL: exact deposit and fee, owner/sponsor signatures, shared, separate or newly created fee treasury (rent priced), simulation mutations, finalized source and native destination evidence, changed receipts and unsafe amounts rejected. Synthetic only.')
