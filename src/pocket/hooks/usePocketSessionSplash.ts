import { useEffect, useRef, useState } from 'react'

const POCKET_SPLASH_SESSION_KEY = 'pocket_splash_shown_v2'
export type PocketSplashState = 'idle' | 'entering' | 'mark' | 'assembling' | 'holding' | 'launching'

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
    const nativeRuntime = document.documentElement.dataset.pocketRuntime === 'native'
    return reduceMotion || (alreadyShown && !nativeRuntime) ? 'idle' : 'entering'
  } catch {
    return 'idle'
  }
}

export default function usePocketSessionSplash(enabled: boolean, canLaunch = true) {
  const [state, setState] = useState<PocketSplashState>(() => resolveInitialState(enabled))
  const previousEnabled = useRef(enabled)

  useEffect(() => {
    if (enabled && !previousEnabled.current) setState(resolveInitialState(true))
    if (!enabled) setState('idle')
    previousEnabled.current = enabled
  }, [enabled])

  useEffect(() => {
    if (state !== 'entering') return
    try { window.sessionStorage.setItem(POCKET_SPLASH_SESSION_KEY, 'true') } catch { /* animation remains available */ }
    const revealTimer = window.setTimeout(() => setState('mark'), 70)
    return () => window.clearTimeout(revealTimer)
  }, [state])

  useEffect(() => {
    if (state !== 'mark') return
    const assembleTimer = window.setTimeout(() => setState('assembling'), 260)
    return () => window.clearTimeout(assembleTimer)
  }, [state])

  useEffect(() => {
    if (state !== 'assembling') return
    const holdTimer = window.setTimeout(() => setState('holding'), 280)
    return () => window.clearTimeout(holdTimer)
  }, [state])

  useEffect(() => {
    if (state !== 'holding') return
    if (canLaunch) {
      setState('launching')
      return
    }
    // The brand animation must never conceal a recoverable startup error or
    // slow dependency. The underlying shell owns its own loading/error state.
    const failSafeTimer = window.setTimeout(() => setState('launching'), 1_800)
    return () => window.clearTimeout(failSafeTimer)
  }, [canLaunch, state])

  useEffect(() => {
    if (state !== 'launching') return
    const finishTimer = window.setTimeout(() => setState('idle'), 320)
    return () => window.clearTimeout(finishTimer)
  }, [state])

  return state
}
