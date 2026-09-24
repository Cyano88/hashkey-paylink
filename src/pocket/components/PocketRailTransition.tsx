import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CPurseIcon } from './CPurseIcon'

// Reference: Spenda mark-to-wordmark reveal, 10.28.56.mp4.
export default function PocketRailTransition() {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (!location.state?.pocketRailTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2200)
    return () => { window.clearTimeout(timer); setVisible(false) }
  }, [location.key, location.state])
  if (!visible || !location.state?.pocketRailTransition) return null
  return <div key={location.key} className="pocket-mode-curtain" aria-hidden="true">
    <div className="pocket-mode-brand">
      <div className="pocket-mode-wordmark"><span className="pocket-mode-mark"><CPurseIcon size={56} title="" /></span><span className="pocket-mode-name">Pocket</span></div>
      <p>{location.state.pocketRailTransition === 'xstocks' ? 'Trade stocks on Xlayer' : 'USDC can do more.'}</p>
    </div>
  </div>
}
