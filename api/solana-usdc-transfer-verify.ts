import { Connection, type ParsedTransactionWithMeta } from '@solana/web3.js'
import { isValidSolanaAddress } from '../src/lib/solanaAddress.js'
import { usdcAmountUnits } from './usdc-transfer-verify.js'
import { formatUnits } from 'viem'
import { POCKET_USDT_ASSETS } from '../src/pocket/lib/pocketUsdtAssets.js'

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
type TransferInput = {payer:string;recipient:string;minAmount:string;asset?:'USDC'|'USDT';exactAmount?:boolean;notBefore?:string;notAfter?:string}

// Match the actual SPL transfer, not unrelated wallet balance changes.
export function verifyParsedSolanaUsdcTransfer(tx: ParsedTransactionWithMeta | null, input: TransferInput) {
 if(!tx?.meta || tx.meta.err)throw Error('Payment is still confirming or failed.')
 const mint=input.asset==='USDT'?POCKET_USDT_ASSETS.solana.address:USDC
 const timestamp=tx.blockTime == null ? null : tx.blockTime*1000
 if(input.notBefore||input.notAfter){
  if(timestamp===null||!Number.isFinite(timestamp))throw Error('Payment confirmation time is unavailable.')
  for(const [bound,before] of [[input.notBefore,true],[input.notAfter,false]] as const){
   if(!bound)continue
   const time=Date.parse(bound)
   if(!Number.isFinite(time)||(before?timestamp<time:timestamp>time))throw Error('Payment is outside the checkout payment window.')
  }
 }
 if(!isValidSolanaAddress(input.payer)||!isValidSolanaAddress(input.recipient)||input.payer===input.recipient)throw Error('Invalid payment wallets.')
 const keys=tx.transaction.message.accountKeys
 if(!keys.some(k=>k.signer&&k.pubkey.toBase58()===input.payer))throw Error('Payment sender did not sign this transaction.')
 const accounts=new Map<string,string>()
 for(const balance of [...(tx.meta.preTokenBalances||[]),...(tx.meta.postTokenBalances||[])]){
  if(balance.mint===mint && balance.uiTokenAmount.decimals===6 && balance.owner && keys[balance.accountIndex])accounts.set(keys[balance.accountIndex].pubkey.toBase58(),balance.owner)
 }
 const instructions=[...tx.transaction.message.instructions,...(tx.meta.innerInstructions||[]).flatMap(group=>group.instructions)]
 let units=0n
 for(const instruction of instructions){
  if(instruction.programId.toBase58()!==TOKEN_PROGRAM||!('parsed' in instruction))continue
  const {type,info}=instruction.parsed||{}
  if(!info||!['transfer','transferChecked'].includes(type)||info.authority!==input.payer)continue
  if(accounts.get(info.source)!==input.payer||accounts.get(info.destination)!==input.recipient)continue
  if(type==='transferChecked'&&(info.mint!==mint||info.tokenAmount?.decimals!==6))continue
  const amount=type==='transferChecked'?info.tokenAmount?.amount:info.amount
  if(typeof amount==='string'&&/^\d+$/.test(amount))units+=BigInt(amount)
 }
 const expected=usdcAmountUnits(input.minAmount)
 if(expected<=0n||(input.exactAmount?units!==expected:units<expected))throw Error('Confirmed stablecoin transfer does not match this payment.')
 return {units,payer:input.payer,amount:formatUnits(units,6),confirmedAt:timestamp===null?undefined:new Date(timestamp).toISOString()}
}

export async function verifySolanaUsdcTransfer(input:TransferInput & {txHash:string;confirmation?:'confirmed'|'finalized'}, connection:Pick<Connection,'getGenesisHash'|'getParsedTransaction'>=new Connection(process.env.SOLANA_RPC_URL||'https://api.mainnet-beta.solana.com','confirmed')){
 if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(input.txHash))throw Error('Invalid Solana transaction signature.')
 if(input.confirmation==='finalized' && await connection.getGenesisHash()!=='5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d')throw Error('Payment RPC is not Solana mainnet.')
 const tx=await connection.getParsedTransaction(input.txHash,{maxSupportedTransactionVersion:0,commitment:input.confirmation||'confirmed'})
 return verifyParsedSolanaUsdcTransfer(tx,input)
}
