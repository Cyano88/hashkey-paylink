const FRAME_ID = 'smile-identity-hosted-web-integration'

// The hosted document is cross-origin. Give it a usable viewport instead of
// scaling its text or attempting to change its internal camera layout.
export function protectSmileViewport(onPresence?: (visible: boolean) => void) {
  const style = document.createElement('style')
  style.textContent = `#${FRAME_ID} {
    top: calc(var(--smile-viewport-top, 0px) + var(--pocket-safe-top, env(safe-area-inset-top, 0px))) !important;
    left: 50% !important; transform: translateX(-50%) !important;
    width: min(100%, 480px) !important;
    height: calc(var(--smile-viewport-height, 100dvh) - var(--pocket-safe-top, env(safe-area-inset-top, 0px)) - var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px))) !important;
    border: 0 !important; border-radius: 0 !important;
    box-shadow: 0 0 0 100vmax #fff !important;
  }
  body:has(#${FRAME_ID})::before { background: #fff !important; }`
  const update = () => {
    document.documentElement.style.setProperty('--smile-viewport-top', `${window.visualViewport?.offsetTop || 0}px`)
    document.documentElement.style.setProperty('--smile-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`)
  }
  let visible = false
  const syncPresence = () => {
    const next = Boolean(document.getElementById(FRAME_ID))
    if (next !== visible) { visible = next; onPresence?.(next) }
  }
  const observer = new MutationObserver(syncPresence)
  observer.observe(document.body, { childList: true })
  syncPresence()
  document.head.appendChild(style)
  update()
  window.visualViewport?.addEventListener('resize', update)
  window.visualViewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  return () => {
    observer.disconnect()
    style.remove()
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    document.documentElement.style.removeProperty('--smile-viewport-top')
    document.documentElement.style.removeProperty('--smile-viewport-height')
  }
}
