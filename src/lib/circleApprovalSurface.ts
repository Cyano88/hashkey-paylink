import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'

// Keep Circle's cross-origin controls intact. Only size the host frame and add
// Pocket's own close action; closing approval is not proof a payment was cancelled.
export function installCircleApprovalSurface(onCancel: () => void, label = 'Close wallet approval') {
  const backdrop = document.createElement('div')
  backdrop.dataset.circleApprovalSurface = ''
  Object.assign(backdrop.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)', zIndex: '2147483645' })
  const panel = document.createElement('div')
  Object.assign(panel.style, { position: 'fixed', background: '#FFFFFF', borderRadius: '24px', overflow: 'hidden' })
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>'
  Object.assign(button.style, { position: 'fixed', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', padding: '12px', border: '0', borderRadius: '9999px', color: '#111827', background: '#FFFFFF', cursor: 'pointer', zIndex: '2147483647' })
  button.addEventListener('click', onCancel)
  backdrop.append(panel, button)
  let frame: HTMLIFrameElement | null = null
  let previousStyle: string | null = null
  const sync = () => {
    const current = document.getElementById('sdkIframe') as HTMLIFrameElement | null
    if (!current) { backdrop.remove(); return }
    if (current !== frame) { frame = current; previousStyle = frame.getAttribute('style') }
    if (!backdrop.isConnected) document.body.appendChild(backdrop)
    const viewport = window.visualViewport
    const height = viewport?.height ?? window.innerHeight
    const width = viewport?.width ?? window.innerWidth
    const x = (viewport?.offsetLeft ?? 0) + Math.max(8, (width - 480) / 2)
    const top = `calc(${viewport?.offsetTop ?? 0}px + max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px))))`
    const panelHeight = `calc(${height}px - max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px))) - max(8px, var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px))))`
    const panelWidth = Math.min(480, width - 16)
    Object.assign(panel.style, { top, left: `${x}px`, width: `${panelWidth}px`, height: panelHeight })
    Object.assign(button.style, { top: `calc(${top} + 4px)`, left: `${x + panelWidth - 48}px` })
    Object.assign(frame.style, { position: 'fixed', inset: 'auto', margin: '0', transform: 'none', top: `calc(${top} + 52px)`, left: `${x}px`, width: `${panelWidth}px`, maxWidth: 'none', height: `calc(${panelHeight} - 52px)`, maxHeight: 'none', border: '0', borderRadius: '0 0 24px 24px', zIndex: '2147483646' })
  }
  const back = (event: Event) => { if (!backdrop.isConnected) return; event.preventDefault(); event.stopImmediatePropagation(); onCancel() }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event) }
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true })
  window.addEventListener('resize', sync)
  window.visualViewport?.addEventListener('resize', sync)
  window.visualViewport?.addEventListener('scroll', sync)
  window.addEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
  document.addEventListener('keydown', key, true)
  sync()
  return () => {
    observer.disconnect()
    window.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    window.removeEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
    document.removeEventListener('keydown', key, true)
    backdrop.remove()
    if (frame?.isConnected) { if (previousStyle === null) frame.removeAttribute('style'); else frame.setAttribute('style', previousStyle) }
  }
}
