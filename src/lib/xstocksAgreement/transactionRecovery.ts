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

// Minimum intrinsic gas for a call, excluding access-list and fork-specific additions.
// A transaction below this lower bound cannot be included on X Layer.
export function stockIntrinsicGasFloor(data:Hex) {
  let gas=21000n;
  for(let i=2;i<data.length;i+=2)gas+=data.slice(i,i+2)==='00'?4n:16n;
  return gas;
}
export function stockActionError(error:unknown,pending:boolean) {
  if(pending)return 'Confirmation is not available yet. Check the saved transaction to continue.';
  const message=error instanceof Error?error.message:'';
  if(/timeout|timed out|HTTP|RPC|intrinsic gas|Version:|Request|fetch/i.test(message))return 'The network could not complete this step. Please try again.';
  return message.length>220?'This step could not be completed. Please try again.':message||'This step could not be completed. Please try again.';
}
