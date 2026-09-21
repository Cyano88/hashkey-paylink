import { useSyncExternalStore } from 'react'

function subscribe(listener: () => void) {
  document.addEventListener('visibilitychange', listener)
  return () => document.removeEventListener('visibilitychange', listener)
}

/** Suspend optional UI refreshes while the page is in the background. */
export default function usePocketPageVisible() {
  return useSyncExternalStore(subscribe, () => document.visibilityState === 'visible', () => false)
}
