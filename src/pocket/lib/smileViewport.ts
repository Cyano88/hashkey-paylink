const FRAME_ID = 'smile-identity-hosted-web-integration'

// The hosted document is cross-origin. Give it a usable viewport instead of
// scaling its text or attempting to change its internal camera layout.
export function protectSmileViewport() {
  const style = document.createElement('style')
  style.textContent = `#${FRAME_ID} {
    top: calc(var(--smile-viewport-top, 0px) + max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px)))) !important;
    left: 50% !important; transform: translateX(-50%) !important;
    width: min(100%, 480px) !important;
    height: calc(var(--smile-viewport-height, 100dvh) - max(8px, var(--pocket-safe-top, env(safe-area-inset-top, 0px))) - max(16px, var(--pocket-safe-bottom, env(safe-area-inset-bottom, 0px)))) !important;
    border: 0 !important; border-radius: 16px !important;
    box-shadow: 0 0 0 100vmax #171717 !important;
  }`
  const update = () => {
    document.documentElement.style.setProperty('--smile-viewport-top', `${window.visualViewport?.offsetTop || 0}px`)
    document.documentElement.style.setProperty('--smile-viewport-height', `${window.visualViewport?.height || window.innerHeight}px`)
  }
  document.head.appendChild(style)
  update()
  window.visualViewport?.addEventListener('resize', update)
  window.visualViewport?.addEventListener('scroll', update)
  window.addEventListener('resize', update)
  return () => {
    style.remove()
    window.visualViewport?.removeEventListener('resize', update)
    window.visualViewport?.removeEventListener('scroll', update)
    window.removeEventListener('resize', update)
    document.documentElement.style.removeProperty('--smile-viewport-top')
    document.documentElement.style.removeProperty('--smile-viewport-height')
  }
}
