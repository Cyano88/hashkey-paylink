import {solanaBridgeNativeAccount,solanaBridgeLamports,prepareNativeSolanaBridge} from './cross-bridge-solana-native.js'
import {Connection,Keypair,PublicKey,Transaction,VersionedTransaction,type AccountInfo} from '@solana/web3.js'
import {getAssociatedTokenAddress,SOLANA_TOKEN_PROGRAM_ID} from '../solana-token.js'
import {checkSolanaRelayerBalance} from './solana-relayer-fees.js'
import {readCrossBridgePrices} from './cross-bridge-prices.js'
import {assertSolanaSponsorshipRunning} from '../emergency-pause.js'
import type {openCrossBridgeReview} from './cross-bridge-review.js'
import type {CrossBridgeChargedPlan,CrossBridgeCost} from './cross-bridge-reimbursement.js'
import type {CrossBridgeWalletBinding} from './cross-bridge-wallets.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
export const CROSS_BRIDGE_SOLANA_GENESIS='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d'
type Review=Awaited<ReturnType<typeof openCrossBridgeReview>>
const fail=():never=>{throw Error('Solana bridge transaction or fee accounts are unavailable.')}
export function crossBridgeSolanaTokenAmount(info:AccountInfo<Buffer>|null,mint:PublicKey,owner?:PublicKey){
 if(!info||!info.owner.equals(SOLANA_TOKEN_PROGRAM_ID)||info.data.length!==165||!info.data.subarray(0,32).equals(mint.toBuffer())||owner&&!info.data.subarray(32,64).equals(owner.toBuffer())||info.data[108]!==1)return fail()
 return info.data.readBigUInt64LE(64)
}
export function createCrossBridgeSolanaCost(wallets:CrossBridgeWalletBinding,asset:string,connection:Connection,sponsor:PublicKey,options:{prices?:typeof readCrossBridgePrices;now?:()=>number}={}){
 const token=crossBridgeAsset('solana',asset),owner=new PublicKey(wallets.source.address),mint=new PublicKey(token.address),now=options.now??Date.now
 if(wallets.source.network!=='solana'||wallets.source.provider!=='circle'||owner.equals(sponsor))return fail()
 const balance=async()=>token.native?await connection.getAccountInfo(owner,'confirmed').then(a=>a?solanaBridgeNativeAccount(a):0n):crossBridgeSolanaTokenAmount(await connection.getAccountInfo(await getAssociatedTokenAddress(mint,owner,true),'confirmed'),mint,owner)
 const estimate=async(plan:CrossBridgeChargedPlan,planHash:string):Promise<CrossBridgeCost>=>{
  if(plan.kind!=='solana'||plan.instructions.length!==2||await connection.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS)return fail()
  const deposit=plan.instructions[0],reimbursement=plan.instructions[1],start=now()
  // Existing ATAs only: never hide provider/treasury setup rent in user SOL.
  let rentUnits=0n
  if(token.native){
   const accounts=await connection.getMultipleAccountsInfo([owner,deposit.keys[3].pubkey,reimbursement.keys[1].pubkey],'confirmed')
   solanaBridgeNativeAccount(accounts[0]);solanaBridgeNativeAccount(accounts[1])
   if(accounts[2])solanaBridgeNativeAccount(accounts[2]);else rentUnits=solanaBridgeLamports(await connection.getMinimumBalanceForRentExemption(0))
  }else{
  const [source,vault,fee]=await connection.getMultipleAccountsInfo([deposit.keys[5].pubkey,deposit.keys[6].pubkey,reimbursement.keys[2].pubkey],'confirmed')
  crossBridgeSolanaTokenAmount(source,mint,owner);crossBridgeSolanaTokenAmount(vault,mint,deposit.keys[3].pubkey);crossBridgeSolanaTokenAmount(fee,mint)
  }
  const block=await connection.getLatestBlockhash('confirmed'),tx=new Transaction({recentBlockhash:block.blockhash,feePayer:sponsor}).add(...plan.instructions)
  const [value,prices]=await Promise.all([connection.getFeeForMessage(tx.compileMessage(),'confirmed'),(options.prices??readCrossBridgePrices)('solana',asset,{now})])
  if(value.value===null||!Number.isSafeInteger(value.value)||value.value<=0)return fail()
  await checkSolanaRelayerBalance(connection,sponsor,BigInt(value.value)+100000n)
  const expiresAt=Math.min(start+30000,prices.gasPrice.observedAt+30000,prices.assetPrice.observedAt+30000)
  if(expiresAt<=now())return fail()
  return {source:'solana',asset,planHash,nativeUnits:BigInt(value.value),rentUnits,...prices,expiresAt}
 }
 return {balance,estimate}
}
/** Partial sponsor signature only. The owner still approves through Circle. */
export async function prepareCrossBridgeSolanaTransaction(review:Review,connection:Connection,relayer:Keypair,options:{now?:()=>number;running?:()=>Promise<void>}={}){
 const now=options.now??Date.now
 const {quote:q,charged,route}=review,plan=charged.plan
 if(q.input.source!=='solana'||plan.kind!=='solana'||q.expiresAt<=now()||await connection.getGenesisHash()!==CROSS_BRIDGE_SOLANA_GENESIS)return fail()
 await (options.running??assertSolanaSponsorshipRunning)()
 const owner=new PublicKey(q.input.sender),mint=new PublicKey(route.tokenIn.address)
 if(owner.equals(relayer.publicKey))return fail()
 if(route.tokenIn.native)return prepareNativeSolanaBridge(review,connection,relayer,now)
 const addresses=[owner,plan.instructions[0].keys[5].pubkey,plan.instructions[0].keys[6].pubkey,plan.instructions[1].keys[2].pubkey]
 const before=await connection.getMultipleAccountsInfo(addresses,'confirmed')
 if(!before[0]||!Number.isSafeInteger(before[0].lamports))return fail()
 const amounts=before.slice(1).map((account,index)=>crossBridgeSolanaTokenAmount(account,mint,index===0?owner:index===1?plan.instructions[0].keys[3].pubkey:undefined))
 if(amounts[0]<charged.totalUnits)throw Object.assign(Error('Insufficient '+q.input.from+' for this bridge and fee.'),{status:422,code:'insufficient_balance'})
 const latest=await connection.getLatestBlockhash('confirmed'),tx=new Transaction({recentBlockhash:latest.blockhash,feePayer:relayer.publicKey}).add(...plan.instructions)
 const fee=(await connection.getFeeForMessage(tx.compileMessage(),'confirmed')).value
 if(fee===null||!Number.isSafeInteger(fee)||fee<=0)return fail()
 await checkSolanaRelayerBalance(connection,relayer.publicKey,BigInt(fee)+100000n)
 tx.partialSign(relayer)
 const simulation=await connection.simulateTransaction(new VersionedTransaction(tx.compileMessage()),{sigVerify:false,replaceRecentBlockhash:false,commitment:'confirmed',accounts:{encoding:'base64',addresses:addresses.map(a=>a.toBase58())}})
 const after=simulation.value.accounts
 if(simulation.value.err||!after||after.length!==4||!after[0]||after[0].lamports!==before[0].lamports)return fail()
 const afterAmounts=after.slice(1).map((account,index)=>{if(!account||account.data[1]!=='base64')return fail();return crossBridgeSolanaTokenAmount({...account,owner:new PublicKey(account.owner),data:Buffer.from(account.data[0],'base64')},mint,index===0?owner:index===1?plan.instructions[0].keys[3].pubkey:undefined)})
 if(afterAmounts[0]!==amounts[0]-charged.totalUnits||afterAmounts[1]!==amounts[1]+BigInt(q.input.amountUnits)||afterAmounts[2]!==amounts[2]+BigInt(q.reimbursementUnits))return fail()
 if(q.expiresAt<=now()||!Number.isSafeInteger(latest.lastValidBlockHeight)||latest.lastValidBlockHeight<=0)return fail()
 return {transaction:tx.serialize({requireAllSignatures:false,verifySignatures:true}).toString('base64'),lastValidBlockHeight:latest.lastValidBlockHeight,networkFeeLamports:String(fee)}
}
