import { useEffect, useState, type CSSProperties } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

// Letter motion reused from Hash PayStream SessionSplash.
export default function PocketRailTransition() {
  const location = useLocation()
  const navigationType=useNavigationType()
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    if (navigationType!=='PUSH' || !location.state?.pocketRailTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    setVisible(true)
    const timer = window.setTimeout(() => setVisible(false), 2200)
    return () => { window.clearTimeout(timer); setVisible(false) }
  }, [location.key, location.state, navigationType])
  if (navigationType!=='PUSH' || !visible || !location.state?.pocketRailTransition) return null
  const message = location.state.pocketRailTransition === 'xstocks' ? 'Stocks can do more' : 'USDC can do more'
  return <div key={location.key} className="pocket-mode-curtain" aria-hidden="true">
    <div className="pocket-mode-letters">
      {Array.from(message).map((letter, index) => <span key={index} style={{ animationDelay: `${index * 24}ms`, '--letter-y': `${[0, 9, -12, 7, -8][index % 5]}px`, '--letter-turn': `${[-16, 12, -10, 8, -6][index % 5]}deg`, '--letter-scale': index === 0 ? 1.55 : 0.3, ...(letter === ' ' ? { minWidth: '0.32em', letterSpacing: 0 } : {}) } as CSSProperties}>{letter === ' ' ? '\u00a0' : letter}</span>)}
    </div>
  </div>
}
