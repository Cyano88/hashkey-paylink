import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto'
import {Transaction,SystemProgram,PublicKey,type Connection} from '@solana/web3.js'
import {parseUnits,formatUnits} from 'viem'
import bs58 from 'bs58'
export type NativeSolanaQuote={version:1;id:string;ownerId:string;network:'solana';asset:'SOL';walletId:string;walletAddress:string;recipient:string;amount:string;amountUnits:string;feeUnits:string;totalUnits:string;transaction:string;lastValidBlockHeight:number;issuedAt:number;expiresAt:number}
const fail=()=>{throw Object.assign(Error('SOL transfer details changed. Review a new estimate.'),{status:409})}
export function solAmountUnits(value:string){if(typeof value!=='string'||! /^(?:0|[1-9]\d{0,9})(?:\.\d{1,9})?$/.test(value))fail();const n=parseUnits(value,9);if(n<=0n||n>BigInt(Number.MAX_SAFE_INTEGER))fail();return n}
export async function quoteNativeSolana(b:{ownerId:string;walletId:string;walletAddress:string;recipient:string;amount:string},rpc:Pick<Connection,'getLatestBlockhash'|'getFeeForMessage'>,now=Date.now()):Promise<NativeSolanaQuote>{
 const from=new PublicKey(b.walletAddress),to=new PublicKey(b.recipient),amount=solAmountUnits(b.amount)
 if(!b.ownerId||!b.walletId||from.equals(to)||to.equals(SystemProgram.programId))fail()
 const block=await rpc.getLatestBlockhash('confirmed'),tx=new Transaction({feePayer:from,...block}).add(SystemProgram.transfer({fromPubkey:from,toPubkey:to,lamports:amount}))
 const fee=(await rpc.getFeeForMessage(tx.compileMessage(),'confirmed')).value
 if(!Number.isSafeInteger(fee)||fee!<=0)fail()
 return {...b,version:1,id:randomUUID(),network:'solana',asset:'SOL',amount:formatUnits(amount,9),amountUnits:String(amount),feeUnits:String(fee),totalUnits:String(amount+BigInt(fee!)),transaction:tx.serialize({requireAllSignatures:false,verifySignatures:false}).toString('base64'),lastValidBlockHeight:block.lastValidBlockHeight,issuedAt:now,expiresAt:now+45000}
}
function mac(payload:string){const key=process.env.POCKET_SWAP_QUOTE_SECRET||'';if(key.length<32)throw Error('Native transfer signing unavailable.');return createHmac('sha256',key).update('pocket:native-sol-send:v1:'+payload).digest()}
export function sealNativeSolana(q:NativeSolanaQuote){const payload=Buffer.from(JSON.stringify(q)).toString('base64url');return payload+'.'+mac(payload).toString('base64url')}
export function validateNativeSolanaTransaction(q:NativeSolanaQuote,raw:string,signed:boolean){
 if(typeof raw!=='string'||raw.length>1800)fail();const bytes=Buffer.from(raw,'base64');if(bytes.toString('base64')!==raw)fail();const tx=Transaction.from(bytes),approved=Transaction.from(Buffer.from(q.transaction,'base64'))
 if(!tx.serializeMessage().equals(approved.serializeMessage())||tx.signatures.length!==1||tx.signatures[0].publicKey.toBase58()!==q.walletAddress||!tx.verifySignatures(signed))fail()
 return {tx,signature:tx.signature?bs58.encode(tx.signature):undefined}
}
export function openNativeSolana(token:string,owner:string,recovery=false,now=Date.now()):NativeSolanaQuote{
 if(typeof token!=='string'||token.length>10000)fail();const [payload,sig,extra]=token.split('.');if(!payload||!sig||extra)fail();const a=Buffer.from(sig,'base64url'),b=mac(payload);if(a.length!==b.length||!timingSafeEqual(a,b))fail();const q=JSON.parse(Buffer.from(payload,'base64url').toString()) as NativeSolanaQuote
 if(q.ownerId!==owner||q.version!==1||q.network!=='solana'||q.asset!=='SOL'||!q.walletId||! /^[0-9a-f-]{36}$/i.test(q.id)||!Number.isSafeInteger(q.issuedAt)||!Number.isSafeInteger(q.expiresAt)||q.expiresAt-q.issuedAt!==45000||q.issuedAt>now+5000||!recovery&&q.expiresAt<=now||!Number.isSafeInteger(q.lastValidBlockHeight)||q.lastValidBlockHeight<=0||solAmountUnits(q.amount).toString()!==q.amountUnits||! /^[1-9]\d{0,10}$/.test(q.feeUnits)||BigInt(q.totalUnits)!==BigInt(q.amountUnits)+BigInt(q.feeUnits))fail()
 const tx=Transaction.from(Buffer.from(q.transaction,'base64')),expected=new Transaction({feePayer:new PublicKey(q.walletAddress),recentBlockhash:tx.recentBlockhash}).add(SystemProgram.transfer({fromPubkey:new PublicKey(q.walletAddress),toPubkey:new PublicKey(q.recipient),lamports:BigInt(q.amountUnits)}))
 if(q.walletAddress===q.recipient||q.recipient===SystemProgram.programId.toBase58()||!tx.serializeMessage().equals(expected.serializeMessage())||tx.signatures.some(s=>s.signature))fail();validateNativeSolanaTransaction(q,q.transaction,false);return q
}
