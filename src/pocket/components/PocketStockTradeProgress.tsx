import { Check, Loader2 } from './PocketIcons'
import type { StockTradeStage } from '../lib/pocketStockSubmission'
export type StockTradeProgress = { stage: StockTradeStage; prepared: boolean; submitted: boolean }
export default function PocketStockTradeProgress({ progress }: { progress: StockTradeProgress }) {
 if (progress.stage === 'idle' || progress.stage === 'failed') return null
 const steps = [
  { label: progress.prepared ? 'Prepared' : 'Preparing', done: progress.prepared, active: progress.stage === 'preparing' },
  { label: progress.submitted ? 'Submitted' : 'Processing', done: progress.submitted, active: progress.stage === 'processing' },
  { label: progress.stage === 'confirming' ? 'Confirming' : 'Completed', done: progress.stage === 'completed', active: progress.stage === 'confirming' },
 ]
 return <ol aria-label="Trade progress" aria-live="polite" className="mb-4 flex items-center justify-between gap-2 text-[10px]">
  {steps.map((step,index)=><li key={index} className={'flex items-center gap-1.5 ' + (step.done ? 'text-emerald-600 dark:text-emerald-400' : step.active ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400')}>
   {step.done ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : step.active ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <span aria-hidden="true" className="h-3 w-3 rounded-full border border-current opacity-40" />}
   <span aria-label={step.label + (step.done ? ' done' : step.active ? ' in progress' : '')}>{step.label}</span>
  </li>)}
 </ol>
}
