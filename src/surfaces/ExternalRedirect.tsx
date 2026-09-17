import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

export default function ExternalRedirect({ origin, pathname, stripPrefix }: { origin: string; pathname?: string; stripPrefix?: string }) {
  const location = useLocation()
  // Origins are application constants, never caller-supplied query parameters.
  const path = stripPrefix ? (location.pathname.slice(stripPrefix.length) || '/') : location.pathname
  const destination = origin + (pathname ?? path) + location.search + location.hash
  useEffect(() => { window.location.replace(destination) }, [destination])
  return <p className="p-6 text-sm text-gray-500">Opening <a href={destination} className="underline">Hash PayLink</a>…</p>
}
