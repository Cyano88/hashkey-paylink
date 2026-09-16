import { Check, Loader2 } from './PocketIcons'
import { bridgeProgressLabel, type PocketPendingBridge } from '../lib/pocketPendingBridge'

export default function PocketBridgeActivityDetails({ bridge, checking, message, onCheck, onNewBridge }: {
  bridge: PocketPendingBridge
  checking: boolean
  message: string
  onCheck(): void
  onNewBridge?: () => void
}) {
  const progress = bridge.progress || (bridge.txHash ? 'submitted' : 'needs_attention')
  const completed = progress === 'completed'
  const failed = progress === 'failed'
  const attention = progress === 'needs_attention'
  const sent = completed || bridge.sourceConfirmed || progress === 'arriving'
  return <div className="mt-3 space-y-3 text-xs">
    {failed ? <p className="text-gray-600 dark:text-gray-300">The source transfer did not complete. You can start again with a fresh quote.</p> : <>
      <ol aria-label="Bridge progress" className="grid grid-cols-3 gap-2">
        {['Sent', 'Arriving', 'Completed'].map((label, index) => {
          const done = completed || index === 0 && sent
          const active = !completed && !attention && (index === 0 ? !sent : index === 1 && sent)
          return <li key={label} className="flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
            {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <span className="h-3 w-3 rounded-full border border-gray-300 dark:border-white/20" />}
            <span>{label}</span><span className="sr-only">{done ? ': confirmed' : active ? ': in progress' : ': pending'}</span>
          </li>
        })}
      </ol>
      <p className="leading-5 text-gray-500">{completed ? 'USDC arrived in your destination wallet.' : attention ? 'This transfer needs attention. Check its status or contact support before repeating it.' : sent ? 'Your USDC has left the source wallet and is arriving at its destination.' : 'Submitted. Waiting for source confirmation.'}</p>
    </>}
    {message && <p role="status" className="leading-5 text-gray-500">{message}</p>}
    <div className="flex items-center justify-between gap-3">
      <span className="text-[11px] capitalize text-gray-400">{bridge.source} to {bridge.destination}</span>
      {!completed && !failed && <button type="button" disabled={checking} onClick={onCheck} className="min-h-11 font-semibold text-blue-600 disabled:opacity-50">{checking ? 'Checking' : 'Check status'}</button>}
      {failed && onNewBridge && <button type="button" onClick={onNewBridge} className="min-h-11 font-semibold text-blue-600">New bridge</button>}
      {completed && <span className="font-semibold text-emerald-600">{bridgeProgressLabel(progress)}</span>}
    </div>
    <p className="break-all font-mono text-[10px] text-gray-400">Reference: {bridge.txHash || bridge.challengeId || bridge.id}</p>
    {bridge.destinationTxHash && <p className="break-all font-mono text-[10px] text-gray-400">Destination: {bridge.destinationTxHash}</p>}
  </div>
}
