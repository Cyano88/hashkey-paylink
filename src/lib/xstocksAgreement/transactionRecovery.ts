import { keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import type { TradeXLayerTransaction, TradeXLayerAction } from './protocol';
export type PendingStockTransaction = {transaction:TradeXLayerTransaction;hash?:Hex;serialized?:Hex;operation?:TradeXLayerAction;evidence?:string};
// Treat persisted browser data as untrusted. Never broadcast a different intent.
export async function validateSignedStockTransaction(record:PendingStockTransaction) {
  if(!record.serialized||!record.hash||keccak256(record.serialized)!==record.hash)throw Error('Saved transaction could not be verified.');
  const tx=parseTransaction(record.serialized),plan=record.transaction;
  const from=await recoverTransactionAddress({serializedTransaction:record.serialized as TransactionSerialized});
  if(tx.chainId!==196||plan.chainId!==196||plan.value!=='0'||(tx.value??0n)!==0n||
     tx.to?.toLowerCase()!==plan.to.toLowerCase()||tx.data!==plan.data||from.toLowerCase()!==plan.account.toLowerCase())
    throw Error('Saved transaction does not match this checkout.');
  return tx;
}
