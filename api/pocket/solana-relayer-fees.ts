import type {Connection,PublicKey} from '@solana/web3.js'

/** Exact SOL cost converted to six-decimal stablecoin units; ceiling is < 1 micro-token. */
export function solanaReimbursementUnits(lamports:bigint,rateScaled8:bigint){
  if(lamports<0n||rateScaled8<=0n)throw Error('Invalid Solana fee estimate.')
  const denominator=100_000_000_000n
  return (lamports*rateScaled8+denominator-1n)/denominator
}
const warnedAt=new Map<string,number>()
/** Operational reserve is paid by Pocket, never added to a customer's quote. */
export async function checkSolanaRelayerBalance(connection:Pick<Connection,'getBalance'>,wallet:PublicKey,requiredLamports:bigint,now=Date.now()){
  const value=await connection.getBalance(wallet,'confirmed')
  if(!Number.isSafeInteger(value)||value<0||requiredLamports<0n)throw Error('Solana fee wallet balance could not be verified.')
  const balance=BigInt(value)
  const configured=process.env.SOLANA_RELAYER_LOW_BALANCE_LAMPORTS?.trim()||'50000000'
  if(!/^\d+$/.test(configured))throw Error('Invalid Solana fee wallet alert threshold.')
  const low=balance-requiredLamports<BigInt(configured)
  const key=wallet.toBase58()
  if(low&&(now-(warnedAt.get(key)??-Infinity)>=300000)){
    console.warn('[pocket-solana-relayer-low-balance]',{wallet:key,balanceLamports:String(balance),requiredLamports:String(requiredLamports),thresholdLamports:configured})
    warnedAt.set(key,now)
  }
  if(!low)warnedAt.delete(key)
  if(balance<requiredLamports)throw Object.assign(Error('Solana network fees are temporarily unavailable. Please try again shortly.'),{status:503})
  return {balanceLamports:balance,low}
}
