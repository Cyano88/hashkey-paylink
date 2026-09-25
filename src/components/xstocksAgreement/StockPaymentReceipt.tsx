import { formatUnits } from 'viem';
import type { TradeXLayerStatus } from '../../lib/xstocksAgreement/protocol';
import { stockDisplayAmount } from '../../lib/xstocksAgreement/display';
export default function StockPaymentReceipt({ status, decimals, label, role }: { status: TradeXLayerStatus; decimals: number; label: string; role: 'customer' | 'provider' }) {
  const receipt = status.stockReceipt;
  if (!receipt || receipt.fundedShares === '0') return null;
  const terminal = [6, 7, 8].includes(status.state ?? -1);
  const rows = terminal
    ? [{ title: role === 'provider' ? 'You received' : 'Paid to seller', units: receipt.sellerUnderlyingAtSettlement, shares: receipt.sellerSettledShares },
       { title: role === 'customer' ? 'Refunded to you' : 'Refunded to buyer', units: receipt.buyerUnderlyingAtSettlement, shares: receipt.buyerSettledShares }].filter(row => BigInt(row.shares) > 0n)
    : [{ title: 'Payment held', units: receipt.currentUnderlyingUnits, shares: receipt.fundedShares }];
  return <div className="space-y-3" aria-label="Payment receipt">
    <dl className="rounded-2xl bg-gray-50 p-4 dark:bg-white/5">{rows.map(row => {
      const amount = stockDisplayAmount(row.units, decimals);
      return <div key={row.title} className="py-1"><dt className="text-xs text-gray-500">{row.title}</dt><dd className="mt-1 break-words text-lg font-semibold">{amount.approximate && !amount.text.startsWith('<') ? 'About ' : ''}{amount.text} {label}</dd></div>;
    })}</dl>
    <details className="text-xs text-gray-500"><summary className="min-h-8 cursor-pointer">Transaction details</summary>
      <p className="mb-3 leading-5">Display amounts are rounded. Exact stock quantities and share records are below. Issuer adjustments can change the stock quantity represented by the shares.</p>
      <dl className="space-y-2 break-all"><div><dt>Shares held when paid</dt><dd>{receipt.fundedShares} share units</dd></div>
        {rows.map(row => <div key={row.title}><dt>{row.title}: exact quantity</dt><dd>{formatUnits(BigInt(row.units), decimals)} {label}</dd><dt>Share units</dt><dd>{row.shares}</dd></div>)}
        <div><dt>Verification block</dt><dd>{receipt.observedBlock}</dd></div>
      </dl>
      {status.escrow && <a className="mt-3 inline-flex min-h-10 items-center underline" href={'https://www.oklink.com/xlayer/address/' + status.escrow} target="_blank" rel="noreferrer">View on X Layer</a>}
    </details>
  </div>;
}
