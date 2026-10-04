import { Connection, type ParsedTransactionWithMeta } from '@solana/web3.js'
import { isValidSolanaAddress } from '../src/lib/solanaAddress.js'
import { usdcAmountUnits } from './usdc-transfer-verify.js'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'

// Match the actual SPL transfer, not unrelated wallet balance changes.
export function verifyParsedSolanaUsdcTransfer(tx: ParsedTransactionWithMeta | null, input: {payer:string;recipient:string;minAmount:string}) {
 if(!tx?.meta || tx.meta.err)throw Error('Payment is still confirming or failed.')
 if(!isValidSolanaAddress(input.payer)||!isValidSolanaAddress(input.recipient)||input.payer===input.recipient)throw Error('Invalid payment wallets.')
 const keys=tx.transaction.message.accountKeys
 if(!keys.some(k=>k.signer&&k.pubkey.toBase58()===input.payer))throw Error('Payment sender did not sign this transaction.')
 const accounts=new Map<string,string>()
 for(const balance of [...(tx.meta.preTokenBalances||[]),...(tx.meta.postTokenBalances||[])]){
  if(balance.mint===USDC && balance.uiTokenAmount.decimals===6 && balance.owner && keys[balance.accountIndex])accounts.set(keys[balance.accountIndex].pubkey.toBase58(),balance.owner)
 }
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(group=>group.instructions)]
 let units=0n
 for(const instruction of instructions){
  if(instruction.programId.toBase58()!==TOKEN_PROGRAM||!('parsed' in instruction))continue
  const {type,info}=instruction.parsed||{}
  if(!info||!['transfer','transferChecked'].includes(type)||info.authority!==input.payer)continue
  if(accounts.get(info.source)!==input.payer||accounts.get(info.destination)!==input.recipient)continue
  if(type==='transferChecked'&&(info.mint!==USDC||info.tokenAmount?.decimals!==6))continue
  const amount=type==='transferChecked'?info.tokenAmount?.amount:info.amount
  if(typeof amount==='string'&&/^\d+$/.test(amount))units+=BigInt(amount)
 }
 if(units<usdcAmountUnits(input.minAmount))throw Error('Confirmed USDC transfer does not match this payment.')
 return {units,payer:input.payer}
}

export async function verifySolanaUsdcTransfer(input:{txHash:string;payer:string;recipient:string;minAmount:string}){
 if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(input.txHash))throw Error('Invalid Solana transaction signature.')
 const connection=new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed')
 const tx=await connection.getParsedTransaction(input.txHash,{maxSupportedTransactionVersion:0,commitment:'confirmed'})
 return verifyParsedSolanaUsdcTransfer(tx,input)
}
