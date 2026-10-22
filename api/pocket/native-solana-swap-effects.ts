import {PublicKey} from '@solana/web3.js'
import {nativeSwapPair} from '../../src/pocket/lib/pocketNativeSwap.js'
import {SOLANA_SWAP_ROUTER} from './native-solana-swap-inspection.js'
import type {inspectNativeSolanaSwapEnvelope} from './native-solana-swap-envelope.js'
import type {preflightNativeSolanaSwap} from './native-solana-swap-preflight.js'
const TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',SYSTEM='11111111111111111111111111111111',WSOL='So11111111111111111111111111111111111111112'
type Evidence=Awaited<ReturnType<typeof preflightNativeSolanaSwap>>
type Input=Parameters<typeof inspectNativeSolanaSwapEnvelope>[0]
function fail():never{throw Error('SOL swap account changes could not be verified.')}
function account(a:any){
 if(a===null)return null
 if(!a||typeof a.executable!=='boolean'||!Number.isSafeInteger(a.lamports)||a.lamports<0)fail()
 const owner=typeof a.owner==='string'?a.owner:a.owner?.toBase58()
 new PublicKey(owner)
 let data:Buffer
 if(Buffer.isBuffer(a.data))data=a.data
 else {if(!Array.isArray(a.data)||a.data.length!==2||a.data[1]!=='base64'||typeof a.data[0]!=='string')fail();data=Buffer.from(a.data[0],'base64');if(data.toString('base64')!==a.data[0])fail()}
 return {owner,data,executable:a.executable,lamports:BigInt(a.lamports)}
}
type Account=NonNullable<ReturnType<typeof account>>
function token(a:Account){
 if(a.owner!==TOKEN||a.executable||a.data.length!==165)fail()
 const d=a.data
 for(const offset of [72,109,129])if(d.readUInt32LE(offset)>1)fail()
 if(d[108]!==1)fail()
 return {owner:new PublicKey(d.subarray(32,64)).toBase58(),mint:new PublicKey(d.subarray(0,32)).toBase58(),amount:d.readBigUInt64LE(64)}
}
/** Strict net-effect check for trusted preflight evidence, never a client body.
 * Same-slot snapshots avoid interpreting unrelated changes as swap proceeds.
 * Sponsored output repays the exact fee and temporary funding atomically.
 */
export function inspectNativeSolanaSwapEffects(input:Input,evidence:Evidence){
 for(const key of ['wallet','from','to','amountUnits','expectedOutUnits','minimumOutUnits'] as const)if(evidence.intent?.[key]!==input[key])fail()
 if(!Array.isArray(evidence.writableAddresses)||evidence.writableAddresses.length!==evidence.accounts.length||new Set(evidence.writableAddresses).size!==evidence.writableAddresses.length||evidence.writableAddresses.some((address,index)=>evidence.accounts[index]?.address!==address))fail()
 if(evidence.wallet!==input.wallet||evidence.snapshotSlot!==evidence.simulationSlot||!Number.isSafeInteger(evidence.snapshotSlot)||evidence.snapshotSlot<=0||evidence.inspection.amountUnits!==input.amountUnits||evidence.inspection.minimumOutUnits!==input.minimumOutUnits)fail()
 const {tokenIn,tokenOut}=nativeSwapPair('solana',input.from,input.to),stable=tokenIn.native?tokenOut:tokenIn
 if(!tokenIn.native&&!tokenOut.native)return inspectStableEffects(input,evidence)
 const wallet=new PublicKey(input.wallet),mint=new PublicKey(stable.address)
 const stableAddress=PublicKey.findProgramAddressSync([wallet.toBuffer(),new PublicKey(TOKEN).toBuffer(),mint.toBuffer()],new PublicKey(ATA))[0].toBase58()
 const temp=PublicKey.findProgramAddressSync([new PublicKey(WSOL).toBuffer(),wallet.toBuffer()],new PublicKey(SOLANA_SWAP_ROUTER))[0].toBase58()
 const rows=new Map(evidence.accounts.map(a=>[a.address,{before:account(a.before),after:account(a.after)}]))
 if(rows.size!==evidence.accounts.length)fail()
 const funds=rows.get(input.wallet),target=rows.get(stableAddress),wrapped=rows.get(temp)
 // RPC simulation represents a closed account either as null or an empty,
 // zero-lamport system account. Neither representation may retain any value.
 const closed=(a:Account|null)=>a===null||a.owner===SYSTEM&&!a.executable&&a.lamports===0n&&a.data.length===0
 const sponsorship=evidence.sponsorship
 if(sponsorship&&tokenIn.native)fail()
 if(!funds||!funds.before&&!sponsorship||!funds.after||!target?.after||!wrapped||!closed(wrapped.before)||!closed(wrapped.after))fail()
 for(const a of [funds.before,funds.after])if(a&&(a.owner!==SYSTEM||a.executable||a.data.length))fail()
 if(sponsorship){
  const sponsor=rows.get(sponsorship.sponsor)
  if(sponsorship.sponsor===input.wallet||!sponsor?.before||!sponsor.after)fail()
  for(const a of [sponsor.before,sponsor.after])if(a.owner!==SYSTEM||a.executable||a.data.length)fail()
  if(sponsor.before.lamports!==sponsor.after.lamports||sponsor.before.lamports<BigInt(sponsorship.temporaryFundingLamports)+BigInt(evidence.networkFeeLamports))fail()
 }
 const after=token(target.after),before=target.before?token(target.before):null
 if(after.owner!==input.wallet||after.mint!==stable.address||before&&(before.owner!==input.wallet||before.mint!==stable.address))fail()
 // Existing token accounts may change only their amount; never authorities/rent.
 if(target.before){if(target.before.lamports!==target.after.lamports||!target.before.data.subarray(0,64).equals(target.after.data.subarray(0,64))||!target.before.data.subarray(72).equals(target.after.data.subarray(72)))fail()}
 else {
  if(!tokenIn.native||target.after.lamports!==BigInt(evidence.inspection.temporaryRentLamports))fail()
  const d=target.after.data;if(d.readUInt32LE(72)||d.readUInt32LE(109)||d.readBigUInt64LE(121)||d.readUInt32LE(129))fail()
 }
 for(const [address,row] of rows){
  if([input.wallet,stableAddress,temp].includes(address))continue
  // Unsupported token programs cannot be assumed harmless.
  if([row.before?.owner,row.after?.owner].includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'))fail()
  const owned=[row.before,row.after].some(a=>a?.owner===TOKEN&&a.data.length===165&&[input.wallet,sponsorship?.sponsor].includes(new PublicKey(a.data.subarray(32,64)).toBase58()))
  if(owned&&(!row.before||!row.after||row.before.owner!==row.after.owner||row.before.executable!==row.after.executable||row.before.lamports!==row.after.lamports||!row.before.data.equals(row.after.data)))fail()
 }
 if(!/^[1-9]\d*$/.test(evidence.networkFeeLamports))fail()
 const fee=BigInt(evidence.networkFeeLamports),rent=target.before?0n:target.after.lamports,delta=after.amount-(before?.amount??0n),nativeDelta=funds.after.lamports-(funds.before?.lamports??0n)
 let received:bigint
 if(tokenIn.native){if(-nativeDelta!==BigInt(input.amountUnits)+fee+rent||delta<BigInt(input.minimumOutUnits))fail();received=delta}
 else {if(delta!==-BigInt(input.amountUnits)||nativeDelta+fee<BigInt(input.minimumOutUnits))fail();received=nativeDelta+fee}
 if(sponsorship&&BigInt(input.minimumOutUnits)<=fee)fail()
 return {executionAvailable:false as const,accountEffectsVerified:true as const,gasPayment:sponsorship?'sponsored-output' as const:'native-wallet' as const,networkFeeLamports:fee.toString(),newAccountRentLamports:rent.toString(),receivedUnits:received.toString()}
}

/** Stable pairs debit one canonical ATA and credit the other. SOL pays only
 * the exact network fee and any newly created output account rent. */
function inspectStableEffects(input:Input,evidence:Evidence){
 if(evidence.sponsorship)fail()
 const {tokenIn,tokenOut}=nativeSwapPair('solana',input.from,input.to)
 const wallet=new PublicKey(input.wallet)
 const ata=(mint:string)=>PublicKey.findProgramAddressSync([wallet.toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0].toBase58()
 const sourceAddress=ata(tokenIn.address),outputAddress=ata(tokenOut.address)
 const rows=new Map(evidence.accounts.map(a=>[a.address,{before:account(a.before),after:account(a.after)}]))
 const funds=rows.get(input.wallet),source=rows.get(sourceAddress),output=rows.get(outputAddress)
 if(!funds?.before||!funds.after||!source?.before||!source.after||!output?.after)fail()
 for(const a of [funds.before,funds.after])if(a.owner!==SYSTEM||a.executable||a.data.length)fail()
 const check=(row:{before:Account|null;after:Account|null},mint:string,creation:boolean)=>{
  if(!row.after)fail()
  const after=token(row.after),before=row.before?token(row.before):null
  if(after.owner!==input.wallet||after.mint!==mint||before&&(before.owner!==input.wallet||before.mint!==mint))fail()
  if(row.before){
   if(row.before.lamports!==row.after.lamports||!row.before.data.subarray(0,64).equals(row.after.data.subarray(0,64))||!row.before.data.subarray(72).equals(row.after.data.subarray(72)))fail()
  }else{
   if(!creation||row.after.lamports!==BigInt(evidence.inspection.temporaryRentLamports))fail()
   const d=row.after.data;if(d.readUInt32LE(72)||d.readUInt32LE(109)||d.readBigUInt64LE(121)||d.readUInt32LE(129))fail()
  }
  return after.amount-(before?.amount??0n)
 }
 const spent=check(source,tokenIn.address,false),received=check(output,tokenOut.address,true)
 for(const [address,row] of rows){
  if([input.wallet,sourceAddress,outputAddress].includes(address))continue
  if([row.before?.owner,row.after?.owner].includes('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'))fail()
  const owned=[row.before,row.after].some(a=>a?.owner===TOKEN&&a.data.length===165&&new PublicKey(a.data.subarray(32,64)).toBase58()===input.wallet)
  if(owned&&(!row.before||!row.after||row.before.owner!==row.after.owner||row.before.executable!==row.after.executable||row.before.lamports!==row.after.lamports||!row.before.data.equals(row.after.data)))fail()
 }
 if(!/^[1-9]\d*$/.test(evidence.networkFeeLamports))fail()
 const fee=BigInt(evidence.networkFeeLamports),rent=output.before?0n:output.after.lamports
 if(spent!==-BigInt(input.amountUnits)||received<BigInt(input.minimumOutUnits)||funds.before.lamports-funds.after.lamports!==fee+rent)fail()
 return {executionAvailable:false as const,accountEffectsVerified:true as const,gasPayment:'native-wallet' as const,networkFeeLamports:String(fee),newAccountRentLamports:String(rent),receivedUnits:String(received)}
}
