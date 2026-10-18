import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {PublicKey,VersionedTransaction,type Connection} from '@solana/web3.js'
import {formatUnits} from 'viem'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {nativeSwapUnits,quoteNativeSwap} from './native-swap-quote.js'
import {okxGet} from './xstocks-swap-provider.js'
import {removeRedundantSolanaSwapSetup} from './native-solana-swap-setup.js'
import {verifiedNativeSolanaSwapPreflight} from './native-solana-swap-verified-preflight.js'
import type {SolanaSwapInstruction} from './native-solana-swap-inspection.js'

export const SOL_SWAP_POLICY={maximumPriorityFeeLamports:'100000',maximumNetworkFeeLamports:'200000'}
type Binding={ownerId:string;walletId:string;walletAddress:string;from:string;to:string;amount:string}
export type SolSwapQuote=Binding&{version:1;network:'solana';id:string;amountUnits:string;expectedOutUnits:string;minimumOutUnits:string;feeUnits:string;rentUnits:string;transaction:string;lastValidBlockHeight:number;issuedAt:number;expiresAt:number;instructions:SolanaSwapInstruction[];lookupAddresses:string[]}
const fail=():never=>{throw Object.assign(Error('Solana swap details changed. Review a new estimate.'),{status:409})}
export const solSwapIntent=(q:SolSwapQuote)=>({wallet:q.walletAddress,from:q.from,to:q.to,amountUnits:q.amountUnits,expectedOutUnits:q.expectedOutUnits,minimumOutUnits:q.minimumOutUnits})
export async function quoteNativeSolanaSwap(binding:Binding,rpc:Connection,read:typeof okxGet=okxGet,now:()=>number=Date.now):Promise<SolSwapQuote>{
 const issuedAt=now(),{tokenIn,tokenOut}=nativeSwapPair('solana',binding.from,binding.to),units=nativeSwapUnits(binding.amount,tokenIn.decimals)
 if(!binding.ownerId||!binding.walletId||!PublicKey.isOnCurve(new PublicKey(binding.walletAddress).toBytes()))fail()
 const balance=await rpc.getBalance(new PublicKey(binding.walletAddress),'confirmed')
 if(!Number.isSafeInteger(balance)||BigInt(balance)<(tokenIn.native?units:0n)+5000n)throw Object.assign(Error('Add SOL to cover this swap and its network fee.'),{status:409})
 const data=await read('swap-instruction',{chainIndex:'501',fromTokenAddress:tokenIn.address,toTokenAddress:tokenOut.address,amount:String(units),userWalletAddress:binding.walletAddress,swapReceiverAddress:binding.walletAddress,swapMode:'exactIn',slippagePercent:'0.5',autoSlippage:'false',priceImpactProtectionPercent:'3',directRoute:'true',maxAccounts:'64',dexIds:'278',computeUnitPrice:'1000'})
 const preview=await quoteNativeSwap({...binding,network:'solana'},async()=>data?.routerResult,now)
 if(typeof data?.tx?.minReceiveAmount!=='string'||!Array.isArray(data.addressLookupTableAccount))fail()
 const instructions=await removeRedundantSolanaSwapSetup(binding.walletAddress,data.instructionLists,rpc)
 const intent={wallet:binding.walletAddress,from:binding.from,to:binding.to,amountUnits:String(units),expectedOutUnits:preview.expectedOutUnits,minimumOutUnits:data.tx.minReceiveAmount}
 const proof=await verifiedNativeSolanaSwapPreflight(intent,instructions,data.addressLookupTableAccount,SOL_SWAP_POLICY,rpc)
 const q:SolSwapQuote={...binding,amount:preview.amount,version:1,network:'solana',id:randomUUID(),...intent,walletAddress:binding.walletAddress,feeUnits:proof.networkFeeLamports,rentUnits:proof.effects.newAccountRentLamports,transaction:proof.transaction,lastValidBlockHeight:proof.lastValidBlockHeight,instructions,lookupAddresses:data.addressLookupTableAccount,issuedAt,expiresAt:issuedAt+45000}
 validateSolSwap(q,binding.ownerId,false,now());return q
}
export function solSwapReview(q:SolSwapQuote){const {tokenIn,tokenOut}=nativeSwapPair('solana',q.from,q.to);return {id:q.id,network:q.network,walletAddress:q.walletAddress,tokenIn,tokenOut,amount:q.amount,expectedOut:formatUnits(BigInt(q.expectedOutUnits),tokenOut.decimals),minimumOut:formatUnits(BigInt(q.minimumOutUnits),tokenOut.decimals),fee:formatUnits(BigInt(q.feeUnits),9),feeAsset:'SOL',feeFromOutput:false,rent:formatUnits(BigInt(q.rentUnits),9),expiresAt:q.expiresAt,providerPriceImprovementFee:true}}
function validateSolSwap(q:SolSwapQuote,owner:string,recovery:boolean,now:number){
 const {tokenIn}=nativeSwapPair('solana',q.from,q.to)
 if(q.version!==1||q.network!=='solana'||q.ownerId!==owner||!q.walletId||! /^[0-9a-f-]{36}$/i.test(q.id)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.expiresAt-q.issuedAt!==45000||q.issuedAt>now+5000||!recovery&&q.expiresAt<=now||!Number.isSafeInteger(q.lastValidBlockHeight)||q.lastValidBlockHeight<=0)fail()
 for(const value of [q.amountUnits,q.expectedOutUnits,q.minimumOutUnits,q.feeUnits])if(typeof value!=='string'||!/^[1-9]\d{0,19}$/.test(value))fail()
 if(nativeSwapUnits(q.amount,tokenIn.decimals)!==BigInt(q.amountUnits)||!/^\d{1,19}$/.test(q.rentUnits)||BigInt(q.feeUnits)>BigInt(SOL_SWAP_POLICY.maximumNetworkFeeLamports)||BigInt(q.minimumOutUnits)>BigInt(q.expectedOutUnits)||BigInt(q.minimumOutUnits)<BigInt(q.expectedOutUnits)*995n/1000n)fail()
 if(typeof q.transaction!=='string'||q.transaction.length>1644||!Array.isArray(q.instructions)||q.instructions.length>16||!Array.isArray(q.lookupAddresses)||q.lookupAddresses.length>8)fail()
 const bytes=Buffer.from(q.transaction,'base64'),tx=VersionedTransaction.deserialize(bytes)
 if(bytes.toString('base64')!==q.transaction||!Buffer.from(tx.serialize()).equals(bytes)||tx.message.version!==0||tx.message.header.numRequiredSignatures!==1||tx.message.staticAccountKeys[0].toBase58()!==q.walletAddress||tx.signatures.some(s=>s.some(b=>b!==0)))fail()
 return q
}
function mac(payload:string){const secret=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(secret.length<32)throw Error('Swap signing unavailable.');return createHmac('sha256',secret).update('pocket:sol-swap:v1:'+payload).digest()}
export function sealSolSwap(q:SolSwapQuote){const payload=Buffer.from(JSON.stringify(q)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function openSolSwap(token:string,owner:string,recovery=false,now=Date.now()){
 if(typeof token!=='string'||token.length>100000)fail();const [payload,signature,extra]=token.split('.');if(!payload||!signature||extra)fail();const actual=Buffer.from(signature,'base64url'),expected=mac(payload);if(actual.length!==expected.length||!timingSafeEqual(actual,expected))fail()
 return validateSolSwap(JSON.parse(Buffer.from(payload,'base64url').toString()),owner,recovery,now)
}
