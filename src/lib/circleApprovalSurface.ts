import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'

// Keep Circle's cross-origin controls intact. Only size the host frame and add
// Pocket's own close action; closing approval is not proof a payment was cancelled.
export function installCircleApprovalSurface(onCancel: () => void, label = 'Close wallet approval') {
  const backdrop = document.createElement('div')
  backdrop.dataset.circleApprovalSurface = ''
  Object.assign(backdrop.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)', zIndex: '2147483645' })
  const panel = document.createElement('div')
  Object.assign(panel.style, { position: 'fixed', background: '#FFFFFF', borderRadius: '28px 28px 0 0', overflow: 'hidden', transition: 'none' })
  const button = document.createElement('button')
  button.type = 'button'
  button.setAttribute('aria-label', label)
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg>'
  Object.assign(button.style, { position: 'absolute', top: '4px', right: '8px', transition: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px', padding: '12px', border: '0', borderRadius: '9999px', color: '#111827', background: '#FFFFFF', cursor: 'pointer', zIndex: '2147483647' })
  button.addEventListener('click', onCancel)
  panel.append(button)
  backdrop.append(panel)
  let frame: HTMLIFrameElement | null = null
  let previousStyle: string | null = null
  const sync = () => {
    frameObserver.disconnect()
    const current = document.getElementById('sdkIframe') as HTMLIFrameElement | null
    if (!current) { backdrop.remove(); return }
    if (current !== frame) { frame = current; previousStyle = frame.getAttribute('style') }
    const viewport = window.visualViewport
    const height = viewport?.height ?? window.innerHeight
    const width = viewport?.width ?? window.innerWidth
    const panelWidth = Math.min(512, width)
    const x = (viewport?.offsetLeft ?? 0) + (width - panelWidth) / 2
    const confirmations = document.querySelectorAll<HTMLElement>('[data-pocket-sheet]')
    const confirmation = confirmations[confirmations.length - 1]
    const preferredHeight = Math.min(600, Math.max(480, (confirmation?.getBoundingClientRect().height || 496) + 64))
    const panelHeight = `min(${preferredHeight}px, calc(${height}px - max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px)))))`
    const top = `calc(${(viewport?.offsetTop ?? 0) + height}px - ${panelHeight})`
    Object.assign(panel.style, { top, left: `${x}px`, width: `${panelWidth}px`, height: panelHeight })
    Object.assign(frame.style, { position: 'fixed', inset: 'auto', margin: '0', transform: 'none', transition: 'none', top: `calc(${top} + 52px)`, left: `${x}px`, width: `${panelWidth}px`, maxWidth: 'none', height: `calc(${panelHeight} - 52px - var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px)))`, maxHeight: 'none', border: '0', borderRadius: '0', zIndex: '2147483646' })
    // Apply all geometry before mounting. The X stays right-anchored to its
    // panel throughout frame insertion, viewport resizing and keyboard changes.
    if (!backdrop.isConnected) document.body.appendChild(backdrop)
    frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
  }
  const back = (event: Event) => { if (!backdrop.isConnected) return; event.preventDefault(); event.stopImmediatePropagation(); onCancel() }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event) }
  const frameObserver = new MutationObserver(sync)
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
    frameObserver.disconnect()
    window.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    window.removeEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
    document.removeEventListener('keydown', key, true)
    backdrop.remove()
    if (frame?.isConnected) { if (previousStyle === null) frame.removeAttribute('style'); else frame.setAttribute('style', previousStyle) }
  }
}
