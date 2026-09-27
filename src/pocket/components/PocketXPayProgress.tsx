import { useRef, useState } from 'react'
﻿import { Check, Loader2, X } from './PocketIcons'
import { xpayProgressSteps, xpayRecoveryView, type XPayRecovery, type XPayRetryAction, type XPayProgressSnapshot } from '../lib/pocketXPayProgress'

export default function PocketXPayProgress({ progress, recovery, onRetry }: { progress: XPayProgressSnapshot; recovery?: XPayRecovery; onRetry?: (action: XPayRetryAction) => Promise<void> }) {
  const [retrying, setRetrying] = useState(false), [retryError, setRetryError] = useState('')
  const locked = useRef(false)
  const recoveryView = recovery ? xpayRecoveryView(progress, recovery) : undefined
  const retry = async () => {
    if (locked.current || !recoveryView?.action || !onRetry) return
    locked.current = true; setRetrying(true); setRetryError('')
    try { await onRetry(recoveryView.action) }
    catch { setRetryError('Could not check this payment. Please try again.') }
    finally { locked.current = false; setRetrying(false) }
  }
  const steps = xpayProgressSteps(progress)
  if (steps.every(step => step.state === 'waiting')) return null
  return <><ol aria-label="Payment progress" aria-live="polite" className="my-5 flex items-start justify-between gap-2">
    {steps.map(step => <li key={step.id} aria-current={step.active ? 'step' : undefined} className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
      <span className={'flex h-5 w-5 items-center justify-center rounded-full ' + (step.done ? 'bg-emerald-600 text-white' : step.failed ? 'bg-red-600 text-white' : 'text-gray-500 dark:text-gray-400')}>
        {step.done ? <Check aria-hidden="true" className="h-3.5 w-3.5"/> : step.failed ? <X aria-hidden="true" className="h-3.5 w-3.5"/> : step.active ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none"/> : <span aria-hidden="true" className="h-3 w-3 rounded-full border border-current opacity-40"/>}
      </span>
      <span className={'text-[11px] leading-4 ' + (step.done ? 'text-emerald-700 dark:text-emerald-400' : step.active ? 'font-medium text-gray-950 dark:text-white' : 'text-gray-500 dark:text-gray-400')}>{step.label}<span className="sr-only">{step.done ? ', completed' : step.failed ? ', failed' : step.active ? ', in progress' : ', waiting'}</span></span>
    </li>)}
  </ol>
    {recoveryView&&<div className="space-y-3"><p role="status" className="text-center text-xs leading-5 text-gray-500 dark:text-gray-400">{retryError||recoveryView.reason}</p>{recoveryView.action&&onRetry&&<button className="pocket-cta-primary w-full" disabled={retrying} aria-busy={retrying} onClick={()=>void retry()}>{retrying&&<Loader2 aria-hidden="true" className="mr-2 h-4 w-4"/>}Retry</button>}</div>}
  </>
}
