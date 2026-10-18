import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {AddressLookupTableAccount,Keypair,PublicKey,VersionedTransaction,TransactionMessage,SystemProgram} from '@solana/web3.js'
import {formatUnits} from 'viem'
import {nativeSwapPair} from '../src/pocket/lib/pocketNativeSwap.ts'
import {quoteNativeSolanaSwap,solSwapReview,sealSolSwap,openSolSwap} from '../api/pocket/native-solana-swap-quote.ts'
import {verifiedNativeSolanaSwapPreflight} from '../api/pocket/native-solana-swap-verified-preflight.ts'
import {verifyNativeSolanaSwapSignature} from '../api/pocket/native-solana-swap-preflight.ts'
import {inspectNativeSolanaSwapEffects} from '../api/pocket/native-solana-swap-effects.ts'
import {solSwapReceiptOutput} from '../api/pocket/native-solana-swap-reconciliation.ts'
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/native-solana-swap-envelopes.json',import.meta.url)))
const policy={maximumPriorityFeeLamports:'100000',maximumNetworkFeeLamports:'200000'}
const sponsor=Keypair.generate(),fee=100000,rent=1855569,TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM=SystemProgram.programId.toBase58()
const account=(owner,lamports,data=Buffer.alloc(0))=>({owner:new PublicKey(owner),lamports,executable:false,data})
const token=(wallet,mint,amount)=>{const d=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(d);new PublicKey(wallet).toBuffer().copy(d,32);d.writeBigUInt64LE(amount,64);d[108]=1;return account(TOKEN,rent,d)}
process.env.POCKET_SWAP_QUOTE_SECRET='sponsored-swap-fixture-'.repeat(4)
for(const {input,instructions:all} of fixtures.filter(f=>f.input.from!=='SOL')){
 const instructions=all.filter(i=>i.programId!=='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'||i.accounts[2].pubkey===input.wallet)
 const router=instructions.find(i=>Buffer.from(i.data,'base64').subarray(0,8).toString('hex')==='aa2955b184501f35'),stable=router.accounts[1].pubkey,temp=router.accounts[2].pubkey,mint=router.accounts[3].pubkey
 // Exercise a real encoded sub-0.50 route, not only an indicative preview.
 input.amountUnits='100000';input.expectedOutUnits=String(BigInt(input.expectedOutUnits)/10n);input.minimumOutUnits=String(BigInt(input.expectedOutUnits)*995n/1000n)
 const routeBytes=Buffer.from(router.data,'base64');routeBytes.writeBigUInt64LE(BigInt(input.amountUnits),16);routeBytes.writeBigUInt64LE(BigInt(input.expectedOutUnits),24);router.data=routeBytes.toString('base64')
 const addresses=[...new Set(instructions.flatMap(i=>i.accounts.filter(a=>!a.isSigner).map(a=>a.pubkey)))].filter(a=>a!==input.wallet).map(a=>new PublicKey(a))
 const table=new AddressLookupTableAccount({key:Keypair.generate().publicKey,state:{deactivationSlot:18446744073709551615n,lastExtendedSlot:1,lastExtendedSlotStartIndex:0,addresses}})
 const loan=Buffer.from(instructions.find(i=>i.programId===SYSTEM).data,'base64').readBigUInt64LE(4)
 const sponsorship={sponsor:sponsor.publicKey.toBase58(),temporaryFundingLamports:String(loan)}
 let keys=[],sponsorLoss=0,missingWallet=true,feeValue=fee
 const state=(address,after=false)=>address===input.wallet?(after?account(SYSTEM,Number(BigInt(input.expectedOutUnits)-BigInt(feeValue))):missingWallet?null:account(SYSTEM,0)):address===stable?token(input.wallet,mint,10000000n-(after?BigInt(input.amountUnits):0n)):address===sponsorship.sponsor?account(SYSTEM,100000000-(after?sponsorLoss:0)):null
 const rpc={getGenesisHash:async()=> '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',getBalance:async()=>{throw Error('Stable-to-SOL must not require wallet SOL')},getMinimumBalanceForRentExemption:async()=>rent,getAddressLookupTable:async()=>({value:table}),getLatestBlockhash:async()=>({blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:1000}),getFeeForMessage:async message=>{assert.equal(message.header.numRequiredSignatures,2);return {value:feeValue}},getMultipleAccountsInfoAndContext:async addresses=>{keys=addresses.map(k=>k.toBase58());return {context:{slot:100},value:keys.map(k=>state(k))}},simulateTransaction:async tx=>{assert.equal(tx.message.staticAccountKeys[0].toBase58(),sponsorship.sponsor);return {context:{slot:100},value:{err:null,unitsConsumed:300000,accounts:keys.map(k=>state(k,true))}}}}
 const proof=await verifiedNativeSolanaSwapPreflight(input,instructions,[table.key.toBase58()],policy,rpc,undefined,sponsorship)
 assert.equal(proof.effects.gasPayment,'sponsored-output');assert.equal(proof.effects.newAccountRentLamports,'0')
 const changed=structuredClone(proof);changed.accounts=proof.accounts.map(r=>({...r}));const sp=changed.accounts.find(r=>r.address===sponsorship.sponsor);sp.after={...sp.after,lamports:sp.after.lamports-1};assert.throws(()=>inspectNativeSolanaSwapEffects(input,changed),'Sponsor shortfall rejected')
 const {tokenIn,tokenOut}=nativeSwapPair('solana',input.from,input.to)
 const data={routerResult:{chainIndex:'501',fromTokenAmount:input.amountUnits,toTokenAmount:input.expectedOutUnits,priceImpactPercent:'0',fromToken:{tokenContractAddress:tokenIn.address,decimal:tokenIn.decimals,taxRate:'0'},toToken:{tokenContractAddress:tokenOut.address,decimal:tokenOut.decimals,taxRate:'0'}},tx:{minReceiveAmount:input.minimumOutUnits},instructionLists:instructions,addressLookupTableAccount:[table.key.toBase58()]}
 const q=await quoteNativeSolanaSwap({ownerId:'owner',walletId:'wallet',walletAddress:input.wallet,from:input.from,to:input.to,amount:formatUnits(BigInt(input.amountUnits),6)},rpc,async()=>data,Date.now,()=>sponsorship.sponsor)
 assert.equal(solSwapReview(q).feeFromOutput,true);assert.equal(solSwapReview(q).minimumOut,formatUnits(BigInt(input.minimumOutUnits)-BigInt(fee),9));assert.equal(solSwapReview(q).rent,'0');assert.deepEqual(openSolSwap(sealSolSwap(q),'owner'),q)
 const tx=VersionedTransaction.deserialize(Buffer.from(q.transaction,'base64')),keyList=tx.message.getAccountKeys({addressLookupTableAccounts:[table]}),allKeys=Array.from({length:keyList.length},(_,i)=>keyList.get(i).toBase58()),wi=allKeys.indexOf(input.wallet),si=allKeys.indexOf(stable)
 const balances=allKeys.map(k=>state(k)?.lamports||0),post=allKeys.map(k=>state(k,true)?.lamports||0),tb=(amount)=>[{owner:input.wallet,mint,accountIndex:si,uiTokenAmount:{amount,decimals:6}}]
 const receipt={transaction:{message:tx.message},meta:{err:null,fee,loadedAddresses:{writable:tx.message.addressTableLookups.flatMap(l=>l.writableIndexes.map(i=>table.state.addresses[i])),readonly:tx.message.addressTableLookups.flatMap(l=>l.readonlyIndexes.map(i=>table.state.addresses[i]))},preBalances:balances,postBalances:post,preTokenBalances:tb('10000000'),postTokenBalances:tb(String(10000000n-BigInt(input.amountUnits)))}}
 assert.equal(wi,1);assert.equal(solSwapReceiptOutput(q,receipt),BigInt(input.expectedOutUnits)-BigInt(fee));const bad=structuredClone(receipt.meta);bad.postBalances[0]--;assert.equal(solSwapReceiptOutput(q,{...receipt,meta:bad}),null)
 sponsorLoss=1;await assert.rejects(()=>verifiedNativeSolanaSwapPreflight(input,instructions,[table.key.toBase58()],policy,rpc,undefined,sponsorship));sponsorLoss=0
 feeValue=200001;await assert.rejects(()=>verifiedNativeSolanaSwapPreflight(input,instructions,[table.key.toBase58()],policy,rpc,undefined,sponsorship));feeValue=fee
 const tiny=structuredClone(instructions),tinyRouter=tiny.find(i=>i===router||Buffer.from(i.data,'base64').subarray(0,8).toString('hex')==='aa2955b184501f35'),tinyBytes=Buffer.from(tinyRouter.data,'base64');tinyBytes.writeBigUInt64LE(100000n,24);tinyRouter.data=tinyBytes.toString('base64')
 await assert.rejects(()=>verifiedNativeSolanaSwapPreflight({...input,expectedOutUnits:'100000',minimumOutUnits:'99500'},tiny,[table.key.toBase58()],policy,rpc,undefined,sponsorship),e=>e.status===409&&/too small to cover/.test(e.message))
 await assert.rejects(()=>verifiedNativeSolanaSwapPreflight(input,instructions,[table.key.toBase58()],policy,rpc,undefined,{...sponsorship,temporaryFundingLamports:String(loan+1n)}))
 console.log('PASS',input.from+'->SOL','zero-SOL quote, exact sponsor repayment, net quote/minimum/receipt, fee cap and loan tampering')
}
const wallet=Keypair.generate(),make=()=>new VersionedTransaction(new TransactionMessage({payerKey:sponsor.publicKey,recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:sponsor.publicKey,lamports:10000})]}).compileToV0Message())
const unsigned=make(),raw=Buffer.from(unsigned.serialize()).toString('base64');unsigned.sign([wallet]);const userSigned=Buffer.from(unsigned.serialize()).toString('base64')
verifyNativeSolanaSwapSignature(raw,userSigned,wallet.publicKey.toBase58(),sponsor.publicKey.toBase58())
assert.throws(()=>verifyNativeSolanaSwapSignature(raw,userSigned,wallet.publicKey.toBase58(),sponsor.publicKey.toBase58(),true))
unsigned.sign([sponsor]);const signed=Buffer.from(unsigned.serialize()).toString('base64');verifyNativeSolanaSwapSignature(raw,signed,wallet.publicKey.toBase58(),sponsor.publicKey.toBase58(),true)
unsigned.signatures[0][0]^=1;assert.throws(()=>verifyNativeSolanaSwapSignature(raw,Buffer.from(unsigned.serialize()).toString('base64'),wallet.publicKey.toBase58(),sponsor.publicKey.toBase58(),true))
console.log('PASS exact two-party message signing; missing or invalid sponsor signatures rejected for recovery')
