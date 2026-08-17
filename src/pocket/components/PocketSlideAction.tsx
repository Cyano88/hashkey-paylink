import { useEffect, useRef } from 'react'
import type { ComponentProps } from 'react'
import { AlertCircle, Check, Loader2, Lock } from 'lucide-react'
import SlideAction, { type SlideActionStatus } from '../../components/SlideAction'
import { cn } from '../../lib/utils'

export type PocketSlideActionStatus = SlideActionStatus

type PocketSlideActionProps = ComponentProps<typeof SlideAction>

const POCKET_DEFAULT_LABELS: NonNullable<PocketSlideActionProps['labels']> = {
  idle: 'Confirm withdrawal',
  disabled: 'Enter withdrawal details',
  pending: 'Confirming withdrawal',
  submitted: 'Withdrawal submitted',
  successful: 'Withdrawal successful',
  error: 'Withdrawal failed',
}

export default function PocketSlideAction({ labels, status, disabled, onConfirm }: PocketSlideActionProps) {
  const activationLocked = useRef(false)
  const unlockTimer = useRef<number | null>(null)
  const mergedLabels = { ...POCKET_DEFAULT_LABELS, ...labels }
  const label = status === 'error'
    ? mergedLabels.error
    : status === 'pending'
      ? mergedLabels.pending
      : status === 'submitted'
        ? mergedLabels.submitted
        : status === 'successful'
          ? mergedLabels.successful
          : disabled
            ? mergedLabels.disabled
            : mergedLabels.idle

  useEffect(() => {
    if (status !== 'idle') activationLocked.current = true
    if (status === 'idle' && !disabled) activationLocked.current = false
    return () => {
      if (unlockTimer.current) window.clearTimeout(unlockTimer.current)
    }
  }, [disabled, status])

  const confirmOnce = () => {
    if (disabled || status !== 'idle' || activationLocked.current) return
    activationLocked.current = true
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
    onConfirm()
    unlockTimer.current = window.setTimeout(() => {
      if (status === 'idle') activationLocked.current = false
    }, 900)
  }

  return (
    <button
      type="button"
      onClick={confirmOnce}
      disabled={disabled || status !== 'idle'}
      aria-label={label}
      className={cn(
        'flex min-h-14 w-full items-center justify-center gap-2 rounded-full bg-gray-950 px-5 text-sm font-bold text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] transition active:scale-[0.99] disabled:cursor-not-allowed dark:bg-white dark:text-gray-950',
        disabled && status === 'idle' && 'opacity-45',
        status === 'pending' && 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
        status === 'submitted' && 'bg-blue-600 text-white dark:bg-blue-500 dark:text-white',
        status === 'successful' && 'bg-emerald-600 text-white dark:bg-emerald-500 dark:text-white',
        status === 'error' && 'bg-red-600 text-white dark:bg-red-500 dark:text-white',
      )}
    >
      {status === 'pending' || status === 'submitted'
        ? <Loader2 className="h-4 w-4 animate-spin" />
        : status === 'successful'
          ? <Check className="h-4 w-4" />
          : status === 'error'
            ? <AlertCircle className="h-4 w-4" />
            : <Lock className="h-4 w-4" />}
      <span>{label}</span>
    </button>
  )
}
