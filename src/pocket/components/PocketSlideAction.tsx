import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight, Loader2 } from 'lucide-react'
import { cn } from '../../lib/utils'
import PocketStatusCheck from './PocketStatusCheck'

export type PocketSlideActionStatus = 'idle' | 'pending' | 'submitted' | 'successful'

export default function PocketSlideAction({ status, disabled, onConfirm, labels }: { status: PocketSlideActionStatus; disabled: boolean; onConfirm: () => void; labels?: Partial<Record<'idle' | 'disabled' | 'pending' | 'submitted' | 'successful', string>> }) {
  const railRef = useRef<HTMLDivElement>(null)
  const startX = useRef(0)
  const dragging = useRef(false)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    setProgress(status === 'idle' ? 0 : 1)
    dragging.current = false
  }, [status])

  const finish = () => {
    if (!dragging.current) return
    dragging.current = false
    if (progress >= 0.82) {
      setProgress(1)
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
      onConfirm()
    } else setProgress(0)
  }

  const label = status === 'pending'
    ? labels?.pending ?? 'Confirming withdrawal'
    : status === 'successful'
      ? labels?.successful ?? 'Withdrawal successful'
      : status === 'submitted'
        ? labels?.submitted ?? 'Withdrawal submitted'
        : disabled
          ? labels?.disabled ?? 'Enter withdrawal details'
          : labels?.idle ?? 'Slide to withdraw'

  return (
    <div
      ref={railRef}
      role="button"
      tabIndex={disabled || status !== 'idle' ? -1 : 0}
      aria-label={label}
      aria-disabled={disabled || status !== 'idle'}
      onKeyDown={event => {
        if ((event.key === 'Enter' || event.key === ' ') && !disabled && status === 'idle') {
          event.preventDefault()
          if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8)
          setProgress(1)
          onConfirm()
        }
      }}
      onPointerDown={event => {
        if (disabled || status !== 'idle') return
        dragging.current = true
        startX.current = event.clientX
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
        if (!dragging.current || status !== 'idle') return
        const travel = Math.max(1, (railRef.current?.clientWidth ?? 0) - 58)
        setProgress(Math.max(0, Math.min(1, (event.clientX - startX.current) / travel)))
      }}
      onPointerUp={finish}
      onPointerCancel={() => { dragging.current = false; setProgress(0) }}
      className={cn(
        'relative isolate h-14 select-none overflow-hidden rounded-full bg-gray-950 p-1.5 text-white shadow-[0_12px_30px_rgba(15,23,42,0.18)] outline-none ring-offset-2 transition-all focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-white dark:text-gray-950 dark:ring-offset-[#111216]',
        disabled && status === 'idle' && 'cursor-not-allowed opacity-45',
        !disabled && status === 'idle' && 'cursor-grab active:cursor-grabbing',
        status === 'successful' && 'bg-emerald-600 dark:bg-emerald-500 dark:text-white',
      )}
      style={{ touchAction: 'none' }}
    >
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center px-16 text-sm font-bold tracking-tight">{label}</span>
      <span
        className="pointer-events-none absolute bottom-1.5 top-1.5 flex aspect-square items-center justify-center rounded-full bg-white/12 shadow-sm ring-1 ring-white/10 transition-[left,background-color] duration-200 dark:bg-gray-950/10 dark:ring-gray-950/10"
        style={{ left: `calc(6px + ${progress} * (100% - 58px))` }}
      >
        {status === 'pending' ? <Loader2 className="h-5 w-5 animate-spin" /> : status === 'successful' ? <PocketStatusCheck className="h-11 w-11 bg-white text-emerald-600 shadow-none ring-0" /> : <ArrowRight className="h-5 w-5" />}
      </span>
    </div>
  )
}
