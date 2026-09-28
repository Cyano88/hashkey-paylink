import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'

// Circle owns the single close control and secure authorization content.
// Pocket supplies a compact, scrollable host; closing does not reverse a transfer.
export function installCircleApprovalSurface(onCancel: () => void, _label = 'Close wallet approval') {
  const backdrop = document.createElement('div')
  backdrop.dataset.circleApprovalSurface = ''
  Object.assign(backdrop.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)', zIndex: '2147483645' })
  const panel = document.createElement('div')
  Object.assign(panel.style, { position: 'fixed', boxSizing: 'border-box', background: '#FFFFFF', borderRadius: '28px 28px 0 0', overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', transition: 'none' })
  backdrop.append(panel)
  let frame: HTMLIFrameElement | null = null
  let previousStyle: string | null = null
  let scrollTop = 0
  panel.addEventListener('scroll', () => { if (frame?.style.position === 'relative') scrollTop = panel.scrollTop })
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
    Object.assign(frame.style, { position: 'relative', inset: 'auto', margin: '0', transform: 'none', transition: 'none', top: 'auto', left: 'auto', width: '100%', maxWidth: 'none', height: '640px', minHeight: '100%', maxHeight: 'none', display: 'block', border: '0', borderRadius: '0', zIndex: 'auto' })
    frame.setAttribute('scrolling', 'yes')
    panel.style.paddingBottom = 'var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px))'
    // Mount before moving the newly-created SDK frame. Modern browsers preserve
    // its browsing context with moveBefore; the fallback runs before frame-ready.
    if (!backdrop.isConnected) document.body.appendChild(backdrop)
    if (frame.parentElement !== panel) {
      const host = panel as HTMLDivElement & { moveBefore?: (node: Node, child: Node | null) => void }
      if (host.moveBefore) host.moveBefore(frame, null)
      else host.appendChild(frame)
    }
    panel.scrollTop = scrollTop
    frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
  }
  const back = (event: Event) => { if (!backdrop.isConnected) return; event.preventDefault(); event.stopImmediatePropagation(); onCancel() }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event) }
  const frameObserver = new MutationObserver(sync)
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
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
    if (frame?.isConnected) { if (previousStyle === null) frame.removeAttribute('style'); else frame.setAttribute('style', previousStyle) }
    backdrop.remove()
  }
}
