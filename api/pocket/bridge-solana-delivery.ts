import {Connection} from '@solana/web3.js'
import {getRpc} from '../relay-solana.js'
import {bscBridgeTokenAddress} from './bsc-bridge-provider.js'

export function solanaBridgeTokenDelta(tx:any,asset:'USDC'|'USDT',recipient:string,hash:string):bigint|null {
 if(!tx?.meta||tx.meta.err!==null||tx.transaction?.signatures?.[0]!==hash||!Array.isArray(tx.meta.preTokenBalances)||!Array.isArray(tx.meta.postTokenBalances))return null
 const mint=bscBridgeTokenAddress('solana',asset)
 const sum=(rows:any[])=>{const seen=new Set<number>();let amount=0n;for(const row of rows){if(row.owner!==recipient||row.mint!==mint)continue;if(!Number.isSafeInteger(row.accountIndex)||row.accountIndex<0||seen.has(row.accountIndex)||row.uiTokenAmount?.decimals!==6||!/^\d{1,20}$/.test(row.uiTokenAmount?.amount))throw Error('Invalid Solana delivery evidence.');seen.add(row.accountIndex);amount+=BigInt(row.uiTokenAmount.amount)}return amount}
 try{return sum(tx.meta.postTokenBalances)-sum(tx.meta.preTokenBalances)}catch{return null}
}
export async function readSolanaBridgeDelivery(asset:'USDC'|'USDT',recipient:string,hash:string){
 if(!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(hash))return null
 const tx=await new Connection(getRpc(),'confirmed').getParsedTransaction(hash,{commitment:'finalized',maxSupportedTransactionVersion:0})
 return solanaBridgeTokenDelta(tx,asset,recipient,hash)
}
