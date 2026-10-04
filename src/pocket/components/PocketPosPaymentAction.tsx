import PocketFundingAction from './PocketFundingAction'
import PocketXPayCheckoutBackdrop from './PocketXPayCheckoutBackdrop'
import { useState, type ComponentProps } from 'react'
import SlideAction from '../../components/SlideAction'
import PocketBottomSheet from './PocketBottomSheet'
import PocketConfirmationDetails from './PocketConfirmationDetails'
import PocketSlideAction from './PocketSlideAction'

type Props = ComponentProps<typeof SlideAction> & ComponentProps<typeof PocketConfirmationDetails> & { funding?:Omit<ComponentProps<typeof PocketFundingAction>,'children'>;pocket: boolean; onReviewClose?:()=>void }

/** Pocket adds review; the existing checkout handler still owns authorization and execution. */
export default function PocketPosPaymentAction({ pocket, amount, equivalent, rows, onReviewClose, funding, ...action }: Props) {
  const [open, setOpen] = useState(false)
  if (!pocket) return <SlideAction {...action} />
  const busy = action.status === 'pending' || action.status === 'submitted'
  const wrap=(children:React.ReactNode)=>funding?<PocketFundingAction {...funding} locked={busy||funding.locked}>{children}</PocketFundingAction>:children
  return <>
    {wrap(<button type="button" className="pocket-cta-primary w-full" disabled={action.disabled || busy} onClick={() => setOpen(true)}>
      {busy ? action.labels?.[action.status] || 'Processing' : action.disabled ? action.labels?.disabled || 'Complete payment details' : 'Review payment'}
    </button>)}
    {open && <><PocketXPayCheckoutBackdrop/><PocketBottomSheet title="Confirm payment" showCloseButton dismissOnBackdrop={false} dismissible={!busy} onClose={() => {setOpen(false);onReviewClose?.()}}>
      <PocketConfirmationDetails amount={amount} equivalent={equivalent} rows={rows} />
      <div className="mt-5">{wrap(<PocketSlideAction {...action} plain approvalRequired={false} onPrepare={async () => {}} labels={{ ...action.labels, idle: 'Confirm payment' }} onConfirm={() => { setOpen(false); action.onConfirm() }} />)}</div>
    </PocketBottomSheet></>}
  </>
}
