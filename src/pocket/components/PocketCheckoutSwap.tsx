import { useCallback } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketStockTrade from './PocketStockTrade'
import usePocketStockWallet from '../hooks/usePocketStockWallet'
import { pocketApiUrl } from '../lib/pocketRoutes'
import type { stockSwapRequest } from '../api/pocketStockSwapClient'

export default function PocketCheckoutSwap({ checkoutId, asset, onClose }: { checkoutId: string; asset: string; onClose: () => void }) {
  const request = useCallback<typeof stockSwapRequest>(async (getAccessToken, body) => {
    const token = await getAccessToken()
    if (!token) throw Error('Sign in to your wallet again.')
    const response = await fetch(pocketApiUrl('/api/v2/checkouts/stock-swap?id=' + encodeURIComponent(checkoutId)), { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok || !data.quote) throw Error(data?.error || 'Conversion is unavailable.')
    return data
  }, [checkoutId])
  const wallet = usePocketStockWallet({ swapRequest: request })
  const locked = wallet.busy || wallet.uncertain || wallet.pending?.status === 'pending'
  return <PocketBottomSheet fullScreen title="Convert before payment" showCloseButton dismissible={!locked} dismissOnBackdrop={false} onClose={onClose}>
    <p className="mb-4 text-sm text-gray-500">Approve the conversion first. Then return to review and approve your merchant payment.</p>
    <PocketStockTrade wallet={wallet} initialMode="swap" fixedOutputAsset={asset} swapRequest={request} />
    <button type="button" disabled={locked} className="pocket-cta-secondary mt-4 w-full" onClick={onClose}>Back to payment</button>
  </PocketBottomSheet>
}
