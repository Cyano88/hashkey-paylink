import { useEffect, useRef, useState } from 'react'
import type { ComponentProps } from 'react'
import SlideAction, { type SlideActionStatus } from '../../components/SlideAction'
import { cn } from '../../lib/utils'
import { preparePocketPaymentApproval, requestPocketPaymentApproval } from '../lib/pocketPaymentApproval'
import { AlertCircle, ArrowLeftRight, Banknote, Check, CheckCircle2, Loader2, Send, Wallet } from './PocketIcons'

export type PocketSlideActionStatus = SlideActionStatus

type PocketSlideActionProps = ComponentProps<typeof SlideAction> & {
  approvalRequired?: boolean
  onPrepare?: () => Promise<void>
}

const POCKET_DEFAULT_LABELS: NonNullable<PocketSlideActionProps['labels']> = {
  idle: 'Confirm withdrawal',
  disabled: 'Enter withdrawal details',
  pending: 'Confirming withdrawal',
  submitted: 'Withdrawal submitted',
  successful: 'Withdrawal successful',
  error: 'Withdrawal failed',
}

export default function PocketSlideAction({ labels, status, disabled, onConfirm, approvalRequired = true, onPrepare }: PocketSlideActionProps) {
  const activationLocked = useRef(false)
  const unlockTimer = useRef<number | null>(null)
  const [optimisticPending, setOptimisticPending] = useState(false)
  const mergedLabels = { ...POCKET_DEFAULT_LABELS, ...labels }
  const action = mergedLabels.idle.toLowerCase()
  const ActionIcon = /swap|move|bridge/.test(action)
    ? ArrowLeftRight
    : /payout|withdraw/.test(action)
      ? Banknote
      : /send/.test(action)
        ? Send
        : /payment|pay/.test(action)
          ? Wallet
          : Check
  const visualStatus = status === 'idle' && optimisticPending ? 'pending' : status
  const label = visualStatus === 'error'
    ? mergedLabels.error
    : visualStatus === 'pending'
      ? mergedLabels.pending === 'Approve with fingerprint' ? 'Confirming send' : mergedLabels.pending
      : visualStatus === 'submitted'
        ? mergedLabels.submitted === 'Sending' ? 'Sent - confirming' : mergedLabels.submitted
        : visualStatus === 'successful'
          ? mergedLabels.successful
          : disabled
            ? mergedLabels.disabled
            : mergedLabels.idle

  useEffect(() => {
    if (status !== 'idle') {
      activationLocked.current = true
      setOptimisticPending(false)
    }
    if (status === 'idle' && !disabled && !optimisticPending) activationLocked.current = false
  }, [disabled, optimisticPending, status])

  useEffect(() => () => {
    if (unlockTimer.current) window.clearTimeout(unlockTimer.current)
  }, [])

  const confirmOnce = async () => {
    if (disabled || status !== 'idle' || activationLocked.current) return
    activationLocked.current = true
    setOptimisticPending(true)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
    try {
      if (onPrepare) await onPrepare()
      else await preparePocketPaymentApproval()
      if (approvalRequired) await requestPocketPaymentApproval()
      onConfirm()
      unlockTimer.current = window.setTimeout(() => {
        setOptimisticPending(false)
        activationLocked.current = false
      }, 1_200)
    } catch {
      setOptimisticPending(false)
      activationLocked.current = false
    }
  }

  return (
    <button
      type="button"
      onClick={() => void confirmOnce()}
      disabled={disabled || visualStatus !== 'idle'}
      aria-label={label}
      aria-live={'polite'}
      className={cn(
        'flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition active:scale-[0.99] disabled:cursor-not-allowed dark:bg-white dark:text-gray-950',
        disabled && status === 'idle' && 'opacity-45',
        visualStatus === 'pending' && 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
        visualStatus === 'submitted' && 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
        visualStatus === 'successful' && 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
        visualStatus === 'error' && 'bg-red-600 text-white dark:bg-red-500 dark:text-white',
      )}
    >
      {visualStatus === 'pending' || visualStatus === 'submitted'
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : visualStatus === 'successful'
          ? <CheckCircle2 className="h-4 w-4" />
          : visualStatus === 'error'
            ? <AlertCircle className="h-4 w-4" />
            : <ActionIcon className="h-4 w-4" />}
      <span>{label}</span>
    </button>
  )
}
