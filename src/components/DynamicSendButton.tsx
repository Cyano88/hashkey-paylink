import { ArrowUp, Plus, Square } from 'lucide-react'
import { cn } from '../lib/utils'

type DynamicSendButtonProps = {
  inputText: string
  isLoading: boolean
  onSend: () => void
  onStop: () => void
  onAddAttachment?: () => void
  disabled?: boolean
  className?: string
}

export default function DynamicSendButton({
  inputText,
  isLoading,
  onSend,
  onStop,
  onAddAttachment,
  disabled = false,
  className,
}: DynamicSendButtonProps) {
  const hasInput = inputText.trim().length > 0
  const state = isLoading ? 'loading' : hasInput ? 'send' : 'idle'

  function handleClick() {
    if (disabled) return
    if (isLoading) {
      onStop()
      return
    }
    if (hasInput) {
      onSend()
      return
    }
    onAddAttachment?.()
  }

  return (
    <button
      type="button"
      onPointerDown={event => event.preventDefault()}
      onClick={handleClick}
      disabled={disabled}
      aria-label={isLoading ? 'Stop response' : hasInput ? 'Send message' : 'Add attachment'}
      className={cn(
        'group relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border transition-all duration-200 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 focus-visible:ring-offset-2 active:scale-[0.94] dark:focus-visible:ring-neutral-500 dark:focus-visible:ring-offset-[#111114]',
        state === 'idle'
          ? 'border-[#3f3f46] bg-[#262626] text-white shadow-[0_5px_16px_rgba(0,0,0,0.18)] hover:bg-[#333333] dark:border-white/15 dark:bg-[#303030] dark:shadow-[0_6px_20px_rgba(0,0,0,0.42)] dark:hover:bg-[#3a3a3a]'
          : 'border-black/10 bg-[#ffffff] text-[#000000] shadow-[0_5px_18px_rgba(0,0,0,0.14)] hover:bg-[#f2f2f2] dark:border-white/20 dark:bg-[#f5f5f5] dark:text-[#000000] dark:shadow-[0_6px_22px_rgba(0,0,0,0.46)] dark:hover:bg-[#ffffff]',
        'disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100',
        className,
      )}
    >
      {isLoading && (
        <span className="pointer-events-none absolute inset-[3px] animate-spin rounded-full border border-transparent border-t-black/65" />
      )}

      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
          state === 'idle' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Plus className="h-6 w-6 stroke-[2.4]" />
      </span>

      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
          state === 'send' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <ArrowUp className="h-6 w-6 stroke-[2.6]" />
      </span>

      <span
        className={cn(
          'absolute inset-0 flex items-center justify-center transition-all duration-200 ease-out',
          state === 'loading' ? 'scale-100 opacity-100' : 'scale-50 opacity-0',
        )}
      >
        <Square className="h-4 w-4 fill-black stroke-black" />
      </span>
    </button>
  )
}
