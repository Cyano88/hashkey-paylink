import { POCKET_NATIVE_BACK_EVENT } from '../pocket/lib/pocketNativeBack'

// Resize the provider viewport, never scroll/reparent the whole iframe. Circle
// keeps its own scrolling authorization body and anchored confirmation footer.
export function installCircleApprovalSurface(onCancel: () => void, _label = 'Close wallet approval') {
  let frame: HTMLIFrameElement | null = null
  let frameWindow: Window | null = null
  const backdrop = document.createElement('div')
  backdrop.dataset.circleApprovalSurface = ''
  Object.assign(backdrop.style, { position: 'fixed', inset: '0', background: 'rgba(0,0,0,.4)', zIndex: '2147483645' })
  const safeArea = document.createElement('div')
  Object.assign(safeArea.style, { position: 'absolute', bottom: '0', left: '0', right: '0', height: 'var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px))', background: '#fff' })
  backdrop.appendChild(safeArea)
  const geometry = document.createElement('style')
  const sync = () => {
    const current = document.getElementById('sdkIframe') as HTMLIFrameElement | null
    if (!current) { backdrop.remove(); return }
    if (current !== frame) {
      frameObserver.disconnect()
      frame = current
      frameWindow = current.contentWindow
      frameObserver.observe(frame, { attributes: true, attributeFilter: ['style', 'width', 'height'] })
    }
    const viewport = window.visualViewport
    const height = viewport?.height ?? window.innerHeight
    const width = viewport?.width ?? window.innerWidth
    const sheets = document.querySelectorAll<HTMLElement>('[data-pocket-sheet]')
    const sheet = sheets[sheets.length - 1]
    const preferredHeight = Math.min(600, (sheet?.getBoundingClientRect().height || 496) + 64)
    const bottom = 'var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px))'
    const size = `min(${preferredHeight}px, calc(${height}px - max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px))) - ${bottom}))`
    const css = `#sdkIframe { position:fixed!important; top:calc(${(viewport?.offsetTop ?? 0) + height}px - ${bottom} - ${size})!important; left:${(viewport?.offsetLeft ?? 0) + (width - Math.min(512, width)) / 2}px!important; right:auto!important; bottom:auto!important; width:${Math.min(512, width)}px!important; height:${size}!important; min-height:0!important; max-height:none!important; margin:0!important; transform:none!important; transition:none!important; border:0!important; border-radius:28px 28px 0 0!important; z-index:2147483646!important; }`
    if (geometry.textContent !== css) geometry.textContent = css
    if (!geometry.isConnected) document.head.appendChild(geometry)
    if (frame.style.display !== 'none' && frame.width !== '0%') {
      if (!backdrop.isConnected) document.body.appendChild(backdrop)
    } else backdrop.remove()
  }
  const back = (event: Event) => {
    if (!frame?.isConnected || !backdrop.isConnected) return
    event.preventDefault()
    event.stopImmediatePropagation()
    onCancel()
  }
  const message = (event: MessageEvent) => {
    // Circle can remove the iframe before this listener runs.
    if (frameWindow && event.origin === 'https://pw-auth.circle.com' && event.source === frameWindow && event.data?.onClose) onCancel()
  }
  const key = (event: KeyboardEvent) => { if (event.key === 'Escape') back(event) }
  const frameObserver = new MutationObserver(sync)
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true })
  window.addEventListener('message', message)
  window.addEventListener('resize', sync)
  window.visualViewport?.addEventListener('resize', sync)
  window.visualViewport?.addEventListener('scroll', sync)
  window.addEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
  document.addEventListener('keydown', key, true)
  sync()
  return () => {
    observer.disconnect()
    frameObserver.disconnect()
    window.removeEventListener('message', message)
    window.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('resize', sync)
    window.visualViewport?.removeEventListener('scroll', sync)
    window.removeEventListener(POCKET_NATIVE_BACK_EVENT, back, true)
    document.removeEventListener('keydown', key, true)
    geometry.remove()
    backdrop.remove()
  }
}
