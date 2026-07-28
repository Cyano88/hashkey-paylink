import { useEffect, useRef, useState } from 'react'

const POCKET_SPLASH_SESSION_KEY = 'pocket_splash_shown'
export type PocketSplashState = 'idle' | 'holding' | 'launching'

function isPageReload() {
  const navigation = window.performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
  return navigation?.type === 'reload'
}

export function resetPocketSessionSplash() {
  try {
    window.sessionStorage.removeItem(POCKET_SPLASH_SESSION_KEY)
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

function resolveInitialState(enabled: boolean): PocketSplashState {
  if (!enabled) return 'idle'
  try {
    const alreadyShown = window.sessionStorage.getItem(POCKET_SPLASH_SESSION_KEY) === 'true'
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.sessionStorage.setItem(POCKET_SPLASH_SESSION_KEY, 'true')
    return alreadyShown || isPageReload() || reduceMotion ? 'idle' : 'holding'
  } catch {
    return 'idle'
  }
}

export default function usePocketSessionSplash(enabled: boolean) {
  const [state, setState] = useState<PocketSplashState>(() => resolveInitialState(enabled))
  const previousEnabled = useRef(enabled)

  useEffect(() => {
    if (enabled && !previousEnabled.current) setState(resolveInitialState(true))
    if (!enabled) setState('idle')
    previousEnabled.current = enabled
  }, [enabled])

  useEffect(() => {
    if (state !== 'holding') return
    const launchTimer = window.setTimeout(() => setState('launching'), 400)
    return () => window.clearTimeout(launchTimer)
  }, [state])

  useEffect(() => {
    if (state !== 'launching') return
    const finishTimer = window.setTimeout(() => setState('idle'), 720)
    return () => window.clearTimeout(finishTimer)
  }, [state])

  return state
}
