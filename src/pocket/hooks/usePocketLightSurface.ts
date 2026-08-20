import { useLayoutEffect } from 'react'

let lightSurfaceCount = 0
let restoreDarkTheme = false
let previousColorScheme = ''
let previousThemeColor = ''

function setPocketLightSurface(active: boolean) {
  const root = document.documentElement
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')

  if (active) {
    if (lightSurfaceCount === 0) {
      restoreDarkTheme = root.classList.contains('dark')
      previousColorScheme = root.style.colorScheme
      previousThemeColor = themeColor?.content ?? ''
      root.classList.remove('dark')
      root.dataset.pocketLightSurface = 'true'
      root.style.colorScheme = 'only light'
      themeColor?.setAttribute('content', '#F5F5F7')
    }
    lightSurfaceCount += 1
    return
  }

  lightSurfaceCount = Math.max(0, lightSurfaceCount - 1)
  if (lightSurfaceCount !== 0) return
  delete root.dataset.pocketLightSurface
  root.style.colorScheme = previousColorScheme
  if (restoreDarkTheme) root.classList.add('dark')
  if (previousThemeColor) themeColor?.setAttribute('content', previousThemeColor)
  else themeColor?.removeAttribute('content')
  restoreDarkTheme = false
  previousColorScheme = ''
  previousThemeColor = ''
}

/** Temporarily presents an onboarding/legal surface in Pocket's fixed light theme. */
export default function usePocketLightSurface(active = true) {
  useLayoutEffect(() => {
    if (!active) return
    setPocketLightSurface(true)
    return () => setPocketLightSurface(false)
  }, [active])
}
