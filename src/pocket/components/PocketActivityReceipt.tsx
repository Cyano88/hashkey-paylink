import { FullScreenReceiptSurface } from '../../components/UnifiedReceipt'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import {useLocation,useNavigate} from 'react-router-dom'
import { pocketActivityAmount } from '../lib/pocketActivityPresentation'
import { useState, type ReactNode } from 'react'
import PocketBottomSheet from './PocketBottomSheet'
import PocketTransactionDetails from './PocketTransactionDetails'
import type { PocketActivityRow } from '../models/pocketActivity'
import { pocketActivityReceipt, pocketActivityStatus, pocketMovementTitle } from '../lib/pocketReceipt'

export default function PocketActivityReceipt({ row, onClose, onRefund, children }: { row: PocketActivityRow; onClose: () => void; onRefund?: (id: string) => Promise<string>; children?: ReactNode }) {
  const navigate=useNavigate(),location=useLocation()
  const [busy,setBusy] = useState(false)
  const [message,setMessage] = useState('')
  const receipt = pocketActivityReceipt(row, { allowPending: true })
  const refundId = row.source === 'bills' ? row.merchantId : undefined
  const actions = <>{children}{row.source==='xpay'&&row.xpayCheckoutId&&/^xp_[0-9a-f-]{36}$/.test(row.xpayCheckoutId)&&['pending','failed'].includes(pocketActivityStatus(row))&&<button type="button" className="pocket-cta-primary mt-4 w-full" onClick={()=>{onClose();navigate('/xpay/checkout/'+row.xpayCheckoutId+'?bank='+encodeURIComponent(row.merchantId||'')+'&resume='+encodeURIComponent(row.eventId),{state:{xpayOrigin:location.pathname.includes('/xstocks/')?'xstocks':'stablecoins',xpayReturnTo:location.pathname}})}}>Continue payment</button>}{row.refundAction && refundId && <div className="py-3 text-center">
    <button type="button" disabled={busy} onClick={async () => {if (!onRefund) {onClose();navigate(POCKET_BASE_PATH + POCKET_ROUTES.billsActivity);return}setBusy(true);setMessage('');try{await onRefund(refundId)}catch(error){setMessage(error instanceof Error ? error.message : 'Refund status is unavailable.')}finally{setBusy(false)}}} className="pocket-cta-primary px-5">{busy ? 'Checking refund' : !onRefund ? 'Manage refund' : row.refundAction === 'claim' ? 'Claim refund' : 'Check refund'}</button>
    {message && <p role="status" className="mt-2 text-xs">{message}</p>}
  </div>}</>
  if (receipt) return <FullScreenReceiptSurface receipt={receipt} surface="receipt" onClose={onClose} extraActions={actions} />
  const status = pocketActivityStatus(row).replace(/_/g, ' ')
  const detailsRows: Array<[string, ReactNode]> = [
    ['Status', <span className="capitalize">{status}</span>],
    ...(row.direction === 'in' && row.payer ? [['From', row.payer] as [string, ReactNode]] : []),
    ...(row.direction !== 'in' && row.recipient ? [['To', row.recipient] as [string, ReactNode]] : []),
    ...(row.feeAmount ? [['Fees', row.feeAmount + ' USDC'] as [string, ReactNode]] : []),
    ['Network', <span className="capitalize">{row.chain}</span>],
    ['Date', new Date(row.ts).toLocaleString()],
  ]
  return <PocketBottomSheet title={pocketMovementTitle(row)} onClose={onClose} showCloseButton={false} dismissOnBackdrop={false} dismissible={!busy}>
    <h2 className="mb-2 text-center text-base font-semibold">{pocketMovementTitle(row)}</h2>
    <p className="mb-5 text-center text-xl font-semibold">{pocketActivityAmount(row)}</p>
    <PocketTransactionDetails rows={detailsRows} />
    {actions}
    <button type="button" className="pocket-cta-primary mt-4 w-full" disabled={busy} onClick={onClose}>Done</button>
  </PocketBottomSheet>
}
