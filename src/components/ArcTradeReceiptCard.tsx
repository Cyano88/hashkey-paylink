import {formatUnits} from 'viem'
import type {ArcTradeReceipt} from '../../api/trade-agreement/receipt'
export default function ArcTradeReceiptCard({receipt}:{receipt:ArcTradeReceipt}){
  function download(){
    const url=URL.createObjectURL(new Blob([JSON.stringify(receipt,null,2)],{type:'application/json'}))
    const link=document.createElement('a');link.href=url;link.download=receipt.id+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <section aria-label="Settlement receipt" className="mt-5 space-y-3 rounded-2xl border border-gray-200 p-4 dark:border-white/15">
    <h2 className="text-sm font-semibold">Settlement receipt</h2>
    <p className="text-xs text-gray-500">Confirmed USDC settlement on Arc</p>
    <dl className="space-y-2 text-sm"><div><dt>Buyer refund</dt><dd>{formatUnits(BigInt(receipt.buyerAmountUnits),6)} USDC</dd></div><div><dt>Seller payment</dt><dd>{formatUnits(BigInt(receipt.sellerAmountUnits),6)} USDC</dd></div><div><dt>Transaction</dt><dd className="break-all text-xs">{receipt.transactionHash}</dd></div><div><dt>Confirmed block</dt><dd>{receipt.blockNumber}</dd></div></dl>
    <button type="button" className="min-h-11 rounded-full border border-gray-200 px-4 text-sm dark:border-white/15" onClick={download}>Download receipt</button>
  </section>
}
