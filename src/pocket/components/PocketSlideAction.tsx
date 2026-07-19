import type { ComponentProps } from 'react'
import SlideAction, { type SlideActionStatus } from '../../components/SlideAction'

export type PocketSlideActionStatus = SlideActionStatus

type PocketSlideActionProps = ComponentProps<typeof SlideAction>

const POCKET_DEFAULT_LABELS: NonNullable<PocketSlideActionProps['labels']> = {
  idle: 'Slide to withdraw',
  disabled: 'Enter withdrawal details',
  pending: 'Confirming withdrawal',
  submitted: 'Withdrawal submitted',
  successful: 'Withdrawal successful',
  error: 'Withdrawal failed',
}

export default function PocketSlideAction({ labels, ...props }: PocketSlideActionProps) {
  return <SlideAction {...props} labels={{ ...POCKET_DEFAULT_LABELS, ...labels }} />
}
