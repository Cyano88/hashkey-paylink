import { useLocation } from 'react-router-dom'

export function useStreamPayPath(path: string) {
  const { search } = useLocation()
  const params = new URLSearchParams(search)
  const app = params.get('app')
  return app ? `${path}?app=${encodeURIComponent(app)}` : path
}
