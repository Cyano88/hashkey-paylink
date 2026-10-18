import {PublicKey} from '@solana/web3.js'
import idl from './idl/okx-solana-v2.json'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'

export const SOLANA_SWAP_ROUTER=idl.address
const WSOL='So11111111111111111111111111111111111111112',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'
type Meta={pubkey:string;isSigner:boolean;isWritable:boolean}
export type SolanaSwapInstruction={programId:string;data:string;accounts:Meta[]}
function fail():never{throw Error('Unsupported Solana swap instruction.')}
/** Bounded Borsh reader against the checked-in, program-owned IDL snapshot. */
export function decodeSolanaSwapInstruction(instruction:SolanaSwapInstruction){
 if(instruction.programId!==SOLANA_SWAP_ROUTER||typeof instruction.data!=='string'||instruction.data.length>12000)fail()
 const data=Buffer.from(instruction.data,'base64')
 if(data.toString('base64')!==instruction.data)fail()
 const spec=idl.instructions.find(i=>i.name==='swap_tob')!
 if(data.length<8||!data.subarray(0,8).equals(Buffer.from(spec.discriminator)))fail()
 let offset=8,budget=4096
 const bytes=(length:number)=>{if(!Number.isInteger(length)||length<0||offset+length>data.length)fail();const result=data.subarray(offset,offset+length);offset+=length;return result}
 const read=(type:any,depth=0):any=>{
  if(depth>24||--budget<0)fail()
  if(typeof type==='string'){
   if(type==='u8')return bytes(1)[0]
   if(type==='u16')return bytes(2).readUInt16LE()
   if(type==='u32')return bytes(4).readUInt32LE()
   if(type==='u64')return bytes(8).readBigUInt64LE()
   if(type==='i64')return bytes(8).readBigInt64LE()
   if(type==='u128'){const b=bytes(16);return b.readBigUInt64LE()+(b.readBigUInt64LE(8)<<64n)}
   if(type==='bool'){const v=bytes(1)[0];if(v>1)fail();return v===1}
   if(type==='pubkey')return new PublicKey(bytes(32)).toBase58()
   if(type==='bytes'){const size=read('u32',depth+1);if(size>1024)fail();return bytes(size).toString('hex')}
   fail()
  }
  if(type.defined){const entry=idl.types.find(t=>t.name===type.defined.name);if(!entry)fail();return read(entry.type,depth+1)}
  if(type.vec||type.array){const count=type.vec?read('u32',depth+1):type.array[1];if(!Number.isInteger(count)||count<0||count>64)fail();return Array.from({length:count},()=>read(type.vec||type.array[0],depth+1))}
  if(type.kind==='struct'){const result:Record<string,unknown>={};for(const f of type.fields||[])result[f.name]=read(f.type,depth+1);return result}
  if(type.kind==='enum'){const variant=type.variants[read('u8',depth+1)];if(!variant)fail();return {name:variant.name,fields:(variant.fields||[]).map((f:any)=>read(f.type||f,depth+1))}}
  fail()
 }
 const decoded:Record<string,any>={};for(const arg of spec.args)decoded[arg.name]=read(arg.type)
 if(offset!==data.length)fail()
 return decoded as {args:{order_id:bigint;amount_in:bigint;expect_amount_out:bigint;slippage:number;routes:{dex:{name:string;fields:unknown[]};weight:number;index:number}[]};commission_info:number;platform_fee_rate:number;trim_rate:number}
}

/** Inspection only. Setup/cleanup, router fees, simulation, message signing and proof remain mandatory. */
export function inspectNativeSolanaSwap(input:{wallet:string;from:string;to:string;amountUnits:string;expectedOutUnits:string;minimumOutUnits:string},instruction:SolanaSwapInstruction){
 const wallet=new PublicKey(input.wallet),program=new PublicKey(SOLANA_SWAP_ROUTER)
 const {tokenIn,tokenOut}=nativeSwapPair('solana',input.from,input.to)
 const mintIn=tokenIn.native?WSOL:tokenIn.address,mintOut=tokenOut.native?WSOL:tokenOut.address
 const tokenAccount=(mint:string)=>mint===WSOL?PublicKey.findProgramAddressSync([new PublicKey(WSOL).toBuffer(),wallet.toBuffer()],program)[0].toBase58():PublicKey.findProgramAddressSync([wallet.toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0].toBase58()
 const decoded=decodeSolanaSwapInstruction(instruction),a=decoded.args
 if(!/^[1-9]\d*$/.test(input.amountUnits)||! /^[1-9]\d*$/.test(input.expectedOutUnits)||! /^[1-9]\d*$/.test(input.minimumOutUnits))fail()
 if(a.amount_in!==BigInt(input.amountUnits)||a.amount_in===(1n<<64n)-1n||a.expect_amount_out!==BigInt(input.expectedOutUnits)||a.slippage>50)fail()
 const minimum=a.expect_amount_out*BigInt(10000-a.slippage)/10000n
 if(minimum<=0n||minimum!==BigInt(input.minimumOutUnits)||!a.routes.length||a.routes.some(r=>r.weight<=0||r.weight>10000))fail()
 if(!Array.isArray(instruction.accounts)||instruction.accounts.length<16||instruction.accounts.length>256)fail()
 for(const meta of instruction.accounts){new PublicKey(meta.pubkey);if(typeof meta.isSigner!=='boolean'||typeof meta.isWritable!=='boolean'||meta.isSigner&&meta.pubkey!==input.wallet)fail()}
 const expected=[input.wallet,tokenAccount(mintIn),tokenAccount(mintOut),mintIn,mintOut]
 expected.forEach((key,index)=>{const meta=instruction.accounts[index];if(meta.pubkey!==key||meta.isSigner!==(index===0)||meta.isWritable!==(index<3))fail()})
 const eventAuthority=PublicKey.findProgramAddressSync([Buffer.from('__event_authority')],program)[0].toBase58()
 for(const [index,key] of [[10,TOKEN],[11,TOKEN],[12,ATA],[13,'11111111111111111111111111111111'],[14,eventAuthority],[15,SOLANA_SWAP_ROUTER]] as const){const meta=instruction.accounts[index];if(meta.pubkey!==key||meta.isWritable||meta.isSigner)fail()}
 return {executionAvailable:false as const,amountUnits:a.amount_in.toString(),expectedOutUnits:a.expect_amount_out.toString(),minimumOutUnits:minimum.toString(),slippageBps:a.slippage,routes:a.routes.map(r=>({dex:r.dex.name,weight:r.weight,index:r.index})),commissionInfo:decoded.commission_info,platformFeeRate:decoded.platform_fee_rate,trimRate:decoded.trim_rate}
}
