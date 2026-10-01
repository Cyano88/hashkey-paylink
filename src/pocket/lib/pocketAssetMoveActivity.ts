import type {PocketActivityRow} from '../models/pocketActivity'
/** Bridge and swap records own their exact source and destination transaction logs. */
export function collapsePocketAssetMoves(rows:PocketActivityRow[]):PocketActivityRow[]{
 const hashes=new Set<string>()
 const add=(chain:string|undefined,hash:string|undefined)=>{if(chain&&hash)hashes.add(chain.toLowerCase()+':'+hash.toLowerCase())}
 for(const row of rows){
  if(row.source!=='wallet-bridge'&&row.source!=='wallet-swap'&&row.source!=='gift')continue
  add(row.chain,row.txHash)
  if(row.source==='gift')add(row.chain,row.refundTxHash)
  if(row.source==='wallet-bridge')add(row.destination||row.bridge?.destination,row.destinationTxHash||row.bridge?.destinationTxHash)
 }
 return rows.filter(row=>!['wallet-deposit','wallet-withdrawal'].includes(row.source||'')||!hashes.has(row.chain.toLowerCase()+':'+row.txHash.toLowerCase()))
}
