import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'

// Leave Circle's frame and internal scrolling untouched: the provider owns
// the authorization body and anchored Confirm control. Pocket owns cancellation.
export function installCircleApprovalSurface(onCancel: () => void, _label = 'Close wallet approval') {
  let frame: HTMLIFrameElement | null = null
  let frameWindow: Window | null = null
  const sync = () => {
    const current = document.getElementById('sdkIframe') as HTMLIFrameElement | null
    if (current && current !== frame) {
      frame = current
      frameWindow = current.contentWindow
    }
  }
  const back = (event: Event) => {
    sync()
    if (!frame?.isConnected) return
    event.preventDefault()
    event.stopImmediatePropagation()
    onCancel()
  }
  const message = (event: MessageEvent) => {
    // Circle's earlier listener can remove the frame before this runs. Retain
    // its exact window identity so the provider's X still settles the attempt.
    if (frameWindow && event.origin === 'https://pw-auth.circle.com' && event.source === frameWindow && event.data?.onClose) onCancel()
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event) }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('message', message)
  window.addEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
  document.addEventListener('keydown', key, true)
  sync()
  return () => {
    observer.disconnect()
    window.removeEventListener('message', message)
    window.removeEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
    document.removeEventListener('keydown', key, true)
  }
}
