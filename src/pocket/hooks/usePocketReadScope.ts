import { useLayoutEffect, useMemo } from 'react'

// Each committed identity gets its own request lock and lifecycle generation.
// Cleanup invalidates token waits, responses, and finally handlers, including
// A -> B -> A transitions and React StrictMode's effect replay.
export default function usePocketReadScope(owner: string, tokenReader: () => Promise<string | null>) {
  const scope = useMemo(() => ({ active: false, generation: 0, busy: false, lastReadAt: 0 }), [owner, tokenReader])
  useLayoutEffect(() => {
    scope.active = true
    scope.generation++
    scope.busy = false
    return () => { scope.active = false; scope.generation++; scope.busy = false }
  }, [scope])
  return scope
}
