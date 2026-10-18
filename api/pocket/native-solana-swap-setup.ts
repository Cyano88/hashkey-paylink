import {PublicKey,type Connection} from '@solana/web3.js'
import type {SolanaSwapInstruction} from './native-solana-swap-inspection.js'
const ATA='ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',TOKEN='TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',SYSTEM='11111111111111111111111111111111'

/** Omit only redundant idempotent setup of an already initialized foreign ATA.
 * Never pay rent for a provider's account or alter any swap instruction. */
export async function removeRedundantSolanaSwapSetup(wallet:string,instructions:SolanaSwapInstruction[],rpc:Pick<Connection,'getAccountInfo'>){
 if(!Array.isArray(instructions)||instructions.length>16)throw Error('Unsupported Solana swap setup.')
 const result:SolanaSwapInstruction[]=[]
 for(const i of instructions){
  if(i.programId!==ATA||i.accounts?.[2]?.pubkey===wallet){result.push(i);continue}
  const a=i.accounts
  if(i.data!=='AQ=='||a.length!==6)throw Error('Unsupported provider account setup.')
  const owner=new PublicKey(a[2].pubkey),mint=new PublicKey(a[3].pubkey)
  const address=PublicKey.findProgramAddressSync([owner.toBuffer(),new PublicKey(TOKEN).toBuffer(),mint.toBuffer()],new PublicKey(ATA))[0]
  const expected:[[string,boolean,boolean],[string,boolean,boolean],[string,boolean,boolean],[string,boolean,boolean],[string,boolean,boolean],[string,boolean,boolean]]=[[wallet,true,true],[address.toBase58(),false,true],[owner.toBase58(),false,false],[mint.toBase58(),false,false],[SYSTEM,false,false],[TOKEN,false,false]]
  if(a.some((m,n)=>m.pubkey!==expected[n][0]||m.isSigner!==expected[n][1]||m.isWritable!==expected[n][2]))throw Error('Unsupported provider account setup.')
  const account=await rpc.getAccountInfo(address,'confirmed')
  if(!account||account.executable||account.owner.toBase58()!==TOKEN||account.data.length!==165||account.data[108]!==1||!account.data.subarray(0,32).equals(mint.toBuffer())||!account.data.subarray(32,64).equals(owner.toBuffer()))throw Error('This swap requires an unsupported provider account fee.')
 }
 return result
}
