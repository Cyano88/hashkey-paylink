import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {Keypair,PublicKey,TransactionMessage,VersionedTransaction,SystemProgram} from '@solana/web3.js'
import {encodeFunctionData,getAddress} from 'viem'
import {nativeSwapPair,NATIVE_SWAP_NETWORKS} from '../src/pocket/lib/pocketNativeSwap.ts'
import {quoteReimbursedNativeEvmSwap,validateNativeEvmSwap,nativeSwapCalls,NATIVE_SWAP_CONTRACTS} from '../api/pocket/native-evm-swap-quote.ts'
import {nativeSwapOutput} from '../api/pocket/native-evm-swap-reconciliation.ts'
import {EVM_PLATFORM_TREASURY} from '../src/lib/platformFees.ts'
import {inspectNativeSolanaSwapEnvelope} from '../api/pocket/native-solana-swap-envelope.ts'
import {inspectNativeSolanaSwapEffects} from '../api/pocket/native-solana-swap-effects.ts'
import {solSwapReceiptOutput} from '../api/pocket/native-solana-swap-reconciliation.ts'
import {solSwapReview,sealSolSwap,openSolSwap} from '../api/pocket/native-solana-swap-quote.ts'
const abi=JSON.parse(readFileSync('src/pocket/lib/pocketOkxRouterAbi.json','utf8'))
const now=Date.now(),wallet='0x'+'1'.repeat(40)
const transfer=(token,from,to,units)=>({address:token,topics:['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef','0x'+'0'.repeat(24)+from.slice(2).toLowerCase(),'0x'+'0'.repeat(24)+to.slice(2).toLowerCase()],data:'0x'+units.toString(16).padStart(64,'0')})
for(const network of NATIVE_SWAP_NETWORKS)for(const from of ['USDT','USDC']){
 const to=from==='USDT'?'USDC':'USDT',{tokenIn,tokenOut}=nativeSwapPair(network,from,to)
 assert.equal(tokenIn.native,false);assert.equal(tokenOut.native,false);assert.throws(()=>nativeSwapPair(network,from,from))
 if(network==='solana')continue
 const contracts=NATIVE_SWAP_CONTRACTS[network],read=async(path,p)=>{
  if(path==='approve-transaction')return {dexContractAddress:contracts.spender}
  const out=BigInt(p.amount)*999n/1000n,min=out*995n/1000n
  return {routerResult:{chainIndex:p.chainIndex,fromTokenAmount:p.amount,toTokenAmount:String(out),priceImpactPercent:'0',fromToken:{tokenContractAddress:tokenIn.address,decimal:'6',taxRate:'0'},toToken:{tokenContractAddress:tokenOut.address,decimal:'6',taxRate:'0'}},tx:{from:wallet,to:contracts.router,value:'0',minReceiveAmount:String(min),data:encodeFunctionData({abi,functionName:'smartSwapByOrderId',args:[1n,{fromToken:BigInt(tokenIn.address),toToken:getAddress(tokenOut.address),fromTokenAmount:BigInt(p.amount),minReturnAmount:min,deadLine:BigInt(Math.floor(now/1000)+300)},[],[],[]]})}}
 }
 const q=await quoteReimbursedNativeEvmSwap({network,from,to,ownerId:'fixture',walletId:'fixture',walletAddress:wallet,amount:'2'},async()=> '0.000001',read,()=>now,async()=>true,2000n*10n**8n)
 assert.equal(q.version,2);assert.equal(BigInt(q.amountUnits)+BigInt(q.stableFeeUnits),2000000n);validateNativeEvmSwap(q,false,now)
 const calls=nativeSwapCalls(q).map(c=>({type:'CALL',from:wallet,to:c.target,input:c.data,value:'0x'+c.value.toString(16)}))
 calls[2].logs=[transfer(tokenOut.address,contracts.router,wallet,BigInt(q.expectedOutUnits))]
 calls[4].logs=[transfer(tokenIn.address,wallet,EVM_PLATFORM_TREASURY,BigInt(q.stableFeeUnits))]
 const trace={type:'CALL',to:wallet,input:q.callData,calls}
 assert.equal(nativeSwapOutput(q,trace),BigInt(q.expectedOutUnits))
 for(const mutate of [t=>t.calls[2].logs=[],t=>t.calls[4].logs=[],t=>t.calls[2].logs[0].address=tokenIn.address]){const bad=structuredClone(trace);mutate(bad);assert.equal(nativeSwapOutput(q,bad),null)}
 console.log('PASS',network,from+'->'+to,'input-funded gas, exact output and reimbursement receipt')
}
const captured=JSON.parse(readFileSync('scripts/fixtures/solana-stable-swap-route.json','utf8'))
const instructions=captured.instructions.filter(i=>i.programId!=='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'||i.accounts[2].pubkey===captured.input.wallet)
const inspection=inspectNativeSolanaSwapEnvelope(captured.input,instructions,{tokenAccountRentLamports:'2039280',maximumPriorityFeeLamports:'100000'})
assert.equal(inspection.commissionInfo,0)
for(const change of [list=>{const r=list.find(i=>i.accounts.length>16);r.accounts[4].pubkey=r.accounts[3].pubkey},list=>list.push({programId:SystemProgram.programId.toBase58(),data:Buffer.alloc(12).toString('base64'),accounts:[]})]){const bad=structuredClone(instructions);change(bad);assert.throws(()=>inspectNativeSolanaSwapEnvelope(captured.input,bad,{tokenAccountRentLamports:'2039280',maximumPriorityFeeLamports:'100000'}))}
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM=SystemProgram.programId.toBase58(),rent=2039280,fee=5500
const acct=(owner,lamports,data=Buffer.alloc(0))=>({owner,lamports,executable:false,data:[data.toString('base64'),'base64']})
const token=(owner,mint,amount)=>{const d=Buffer.alloc(165);new PublicKey(mint).toBuffer().copy(d);new PublicKey(owner).toBuffer().copy(d,32);d.writeBigUInt64LE(amount,64);d[108]=1;return acct(TOKEN,rent,d)}
process.env.POCKET_SWAP_QUOTE_SECRET='stable-swap-test-secret-'.repeat(3)
for(const from of ['USDT','USDC'])for(const create of [false,true]){
 const to=from==='USDT'?'USDC':'USDT',pair=nativeSwapPair('solana',from,to),owner=captured.input.wallet
 const ata=mint=>PublicKey.findProgramAddressSync([new PublicKey(owner).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0]
 const source=ata(pair.tokenIn.address),output=ata(pair.tokenOut.address),input={wallet:owner,from,to,amountUnits:'1000000',expectedOutUnits:'999000',minimumOutUnits:'994005'}
 const evidence={intent:input,wallet:owner,snapshotSlot:100,simulationSlot:100,inspection:{amountUnits:input.amountUnits,minimumOutUnits:input.minimumOutUnits,temporaryRentLamports:String(rent)},networkFeeLamports:String(fee),accounts:[{address:owner,before:acct(SYSTEM,100000000),after:acct(SYSTEM,100000000-fee-(create?rent:0))},{address:source.toBase58(),before:token(owner,pair.tokenIn.address,2000000n),after:token(owner,pair.tokenIn.address,1000000n)},{address:output.toBase58(),before:create?null:token(owner,pair.tokenOut.address,100n),after:token(owner,pair.tokenOut.address,999000n+(create?0n:100n))}]}
 evidence.writableAddresses=evidence.accounts.map(a=>a.address)
 assert.equal(inspectNativeSolanaSwapEffects(input,evidence).receivedUnits,'999000')
 for(const mutate of [e=>e.accounts[0].after.lamports--,e=>e.simulationSlot++,e=>{const d=Buffer.from(e.accounts[1].after.data[0],'base64');d.writeBigUInt64LE(999999n,64);e.accounts[1].after.data[0]=d.toString('base64')},e=>{const d=Buffer.from(e.accounts[2].after.data[0],'base64');d.writeUInt32LE(1,72);e.accounts[2].after.data[0]=d.toString('base64')},e=>e.sponsorship={sponsor:Keypair.generate().publicKey.toBase58(),temporaryFundingLamports:'1'}]){const bad=structuredClone(evidence);mutate(bad);assert.throws(()=>inspectNativeSolanaSwapEffects(input,bad))}
 const tx=new VersionedTransaction(new TransactionMessage({payerKey:new PublicKey(owner),recentBlockhash:Keypair.generate().publicKey.toBase58(),instructions:[]}).compileToV0Message())
 const q={version:1,network:'solana',id:'11111111-1111-4111-8111-111111111111',ownerId:'fixture',walletId:'fixture',walletAddress:owner,from,to,amount:'1',amountUnits:'1000000',expectedOutUnits:'999000',minimumOutUnits:'994005',feeUnits:String(fee),rentUnits:create?String(rent):'0',transaction:Buffer.from(tx.serialize()).toString('base64'),lastValidBlockHeight:1000,instructions:[],lookupAddresses:[],issuedAt:now,expiresAt:now+45000}
 assert.equal(openSolSwap(sealSolSwap(q),'fixture',false,now).to,to)
 assert.equal(solSwapReview(q).expectedOut,'0.999');assert.equal(solSwapReview(q).feeFromOutput,false)
 const balance=(mint,amount,index)=>({owner,mint,accountIndex:index,uiTokenAmount:{amount,decimals:6}})
 const receipt={transaction:{message:{serialize:()=>tx.message.serialize(),getAccountKeys:()=>({get:i=>[new PublicKey(owner),source,output][i]})}},meta:{err:null,fee,preBalances:[100000000],postBalances:[100000000-fee-(create?rent:0)],preTokenBalances:[balance(pair.tokenIn.address,'2000000',1),...create?[]:[balance(pair.tokenOut.address,'100',2)]],postTokenBalances:[balance(pair.tokenIn.address,'1000000',1),balance(pair.tokenOut.address,create?'999000':'999100',2)]}}
 assert.equal(solSwapReceiptOutput(q,receipt),999000n)
 const wrong=structuredClone(receipt.meta);wrong.postBalances[0]--;assert.equal(solSwapReceiptOutput(q,{...receipt,meta:wrong}),null)
 const short=structuredClone(receipt.meta);short.postTokenBalances[1].uiTokenAmount.amount='1';assert.equal(solSwapReceiptOutput(q,{...receipt,meta:short}),null)
 console.log('PASS Solana',from+'->'+to,create?'new ATA':'existing ATA','exact source/output/fee/rent, authority guards and receipt')
}
console.log('PASS captured live Solana stable route structural verification; fixtures only, no signatures or broadcast')
