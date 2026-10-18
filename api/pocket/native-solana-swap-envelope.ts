import {PublicKey} from '@solana/web3.js'
import {inspectNativeSolanaSwap,SOLANA_SWAP_ROUTER,type SolanaSwapInstruction} from './native-solana-swap-inspection.js'

const SYSTEM='11111111111111111111111111111111',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',WSOL='So11111111111111111111111111111111111111112',COMPUTE='ComputeBudget111111111111111111111111111111'
type Input=Parameters<typeof inspectNativeSolanaSwap>[0]
function fail():never{throw Error('Unsupported Solana swap setup.')}
function metas(i:SolanaSwapInstruction,expected:[string,boolean,boolean][]){
 if(i.accounts.length!==expected.length)fail()
 expected.forEach(([pubkey,isSigner,isWritable],n)=>{const a=i.accounts[n];if(a.pubkey!==pubkey||a.isSigner!==isSigner||a.isWritable!==isWritable)fail()})
}
/** Structural inspection only: RPC rent and a server-set fee cap must be supplied.
 * This is not authorization to sign. Router CPI effects still require simulation/proof.
 */
export function inspectNativeSolanaSwapEnvelope(input:Input,instructions:SolanaSwapInstruction[],policy:{tokenAccountRentLamports:string;maximumPriorityFeeLamports:string}){
 if(!/^[1-9]\d*$/.test(policy.tokenAccountRentLamports)||!/^\d+$/.test(policy.maximumPriorityFeeLamports)||!Array.isArray(instructions)||instructions.length>16)fail()
 const rent=BigInt(policy.tokenAccountRentLamports),wallet=input.wallet
 const [temporary,bump]=PublicKey.findProgramAddressSync([new PublicKey(WSOL).toBuffer(),new PublicKey(wallet).toBuffer()],new PublicKey(SOLANA_SWAP_ROUTER))
 const temp=temporary.toBase58(),nativeInput=input.from==='SOL'
 let funded=false,created=false,closed=false,swap:ReturnType<typeof inspectNativeSolanaSwap>|undefined,limit=0,price:bigint|undefined,heap=0,ataCount=0
 const seenAta=new Set<string>()
 for(const i of instructions){
  if(typeof i.data!=='string'||i.data.length>12000||!Array.isArray(i.accounts))fail()
  const data=Buffer.from(i.data,'base64');if(data.toString('base64')!==i.data)fail()
  if(i.programId===COMPUTE){
   if(funded||swap||i.accounts.length)fail()
   if(data.length===5&&data[0]===2&&!limit){limit=data.readUInt32LE(1);if(!limit||limit>1400000)fail()}
   else if(data.length===9&&data[0]===3&&price===undefined)price=data.readBigUInt64LE(1)
   else if(data[0]===1&&!heap&&(data.length===5||data.length===9&&data.readUInt32LE(5)===0)){heap=data.readUInt32LE(1);if(heap<32768||heap>262144||heap%1024)fail()}
   else fail()
  }else if(i.programId===SYSTEM){
   if(funded||created||swap||data.length!==12||data.readUInt32LE()!==2)fail()
   metas(i,[[wallet,true,true],[temp,false,true]])
   // Providers can retain an older rent estimate. Excess funding is allowed only
   // for this wallet's temporary WSOL account; effects must prove its full refund.
   const temporaryFunding=data.readBigUInt64LE(4)-(nativeInput?BigInt(input.amountUnits):0n)
   if(temporaryFunding<rent||temporaryFunding>rent+1000000n)fail()
   funded=true
  }else if(i.programId===SOLANA_SWAP_ROUTER&&data.subarray(0,8).toString('hex')==='93f17b64f484ae76'){
   if(!funded||created||swap||data.length!==9||data[8]!==bump)fail()
   metas(i,[[wallet,true,true],[wallet,false,false],[temp,false,true],[WSOL,false,false],[TOKEN,false,false],[SYSTEM,false,false]])
   created=true
  }else if(i.programId===ATA){
   if(!created||swap||data.length!==1||data[0]!==1||i.accounts.length!==6)fail()
   const mint=i.accounts[3].pubkey
   const router=instructions.find(x=>x.programId===SOLANA_SWAP_ROUTER&&Buffer.from(x.data,'base64').subarray(0,8).toString('hex')==='aa2955b184501f35')
   if(!router||![router.accounts[3]?.pubkey,router.accounts[4]?.pubkey].includes(mint)||mint===WSOL)fail()
   const address=PublicKey.findProgramAddressSync([new PublicKey(wallet).toBuffer(),new PublicKey(TOKEN).toBuffer(),new PublicKey(mint).toBuffer()],new PublicKey(ATA))[0].toBase58()
   metas(i,[[wallet,true,true],[address,false,true],[wallet,false,false],[mint,false,false],[SYSTEM,false,false],[TOKEN,false,false]])
   if(seenAta.has(address))fail();seenAta.add(address);ataCount++
  }else if(i.programId===SOLANA_SWAP_ROUTER){
   if(!created||swap)fail()
   swap=inspectNativeSolanaSwap(input,i)
   // Zero commission/platform fees only; native output uses the internal close flag.
   if(swap.commissionInfo!==(nativeInput?0:1073741824)||swap.platformFeeRate!==0||swap.trimRate>100)fail()
  }else if(i.programId===TOKEN){
   if(!swap||!nativeInput||closed||data.length!==1||data[0]!==9)fail()
   metas(i,[[temp,false,true],[wallet,false,true],[wallet,true,true]]);closed=true
  }else fail()
 }
 if(!swap||!limit||price===undefined||nativeInput!==closed)fail()
 const priority=(BigInt(limit)*price+999999n)/1000000n
 if(priority>BigInt(policy.maximumPriorityFeeLamports))fail()
 return {...swap,executionAvailable:false as const,temporaryRentLamports:rent.toString(),maximumAdditionalAccountRentLamports:(rent*BigInt(ataCount)).toString(),priorityFeeLamports:priority.toString(),requiresSimulation:true as const}
}
