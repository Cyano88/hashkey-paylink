export const POCKET_NATIVE_BACK_EVENT = 'pocket:native-back'

// One handler at the host covers every native route, including gifts and receipts.
export function dispatchPocketNativeBack({ atHome, canGoBack, back, home, minimize }: { atHome: boolean; canGoBack: boolean; back(): void; home(): void; minimize(): void }) {
  const event = new Event(POCKET_NATIVE_BACK_EVENT, { cancelable: true, bubbles: true })
  // Dispatch below window so capture handlers run before page handlers.
  if (!document.dispatchEvent(event)) return
  // Provider dialogs must never navigate the payment page underneath them.
  if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return
  if (atHome) minimize()
  else if (canGoBack) back()
  else home()
}
