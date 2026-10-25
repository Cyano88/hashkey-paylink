import type {CirclePocketActionRecord} from '../circle-pocket-action-journal.js'

const bridges = new Set(['wallet.bridge','wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge','bank-withdraw.route'])
const swaps = new Set(['wallet.swap','wallet.native-swap','wallet.bsc-swap','wallet.cash-conversion'])
type Transfer = {txHash?:string;chain:string;assetSymbol?:string;direction?:string;ts:number}

/** Keep provider-owned transfer legs silent. Unknown settlement hashes must wait
 * for reconciliation, not race the operation's single completion notification. */
export function exchangeTransferDisposition(row:Transfer, actions:CirclePocketActionRecord[]):'suppress'|'defer'|'allow' {
 for(const action of actions){
  if(!bridges.has(action.action)&&!swaps.has(action.action))continue
  const m=action.metadata||{}
  if(row.txHash&&[action.resourceId,m.txHash,m.destinationTxHash,m.refundTxHash].some(hash=>hash&&hash.toLowerCase()===row.txHash!.toLowerCase()))return 'suppress'
 }
 for(const action of actions){
  if(!bridges.has(action.action)&&!swaps.has(action.action))continue
  const m=action.metadata||{}
  const bridge=bridges.has(action.action)
  const missingSettlement=bridge&&action.status==='completed'&&!m.destinationTxHash
  if((!['started','submitted'].includes(action.status)&&!missingSettlement)||row.ts<action.createdAt-30_000)continue
  if(m.approvalCancelled==='true'||['cancelled','not_submitted'].includes(m.paymentState))continue
  const network=bridge?(row.direction==='in'?m.destination:m.source):(m.network||(action.action==='wallet.swap'?'arc':action.action==='wallet.cash-conversion'?'base':action.action==='wallet.bsc-swap'?'bsc':undefined))
  if(network!==row.chain)continue
  const asset=bridge?(m.assetSymbol||(action.action==='wallet.usdt-bridge'?'USDT':'USDC')):row.direction==='in'?(m.toAsset||m.to||m.tokenOut||(action.action==='wallet.cash-conversion'?'USDC':undefined)):(m.assetSymbol||m.from||m.tokenIn||(action.action==='wallet.cash-conversion'?'USDT':undefined))
  if(asset&&row.assetSymbol&&asset!==row.assetSymbol)continue
  return 'defer'
 }
 return 'allow'
}
