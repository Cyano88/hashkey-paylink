import { useLocation, useNavigate } from 'react-router-dom'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import { isXStocksPath, xStockPath, type PocketRail } from '../lib/pocketRail'

export default function PocketRailSwitcher() {
  const location = useLocation()
  const navigate = useNavigate()
  const rail: PocketRail = isXStocksPath(location.pathname) ? 'xstocks' : 'stablecoins'
  const select = (next: PocketRail) => {
    if (next === rail) return
    navigate(next === 'xstocks' ? xStockPath('home') : POCKET_BASE_PATH + POCKET_ROUTES.home, {
      state: { pocketRailTransition: next },
    })
  }
  return <div className="pocket-mode-pill" role="group" aria-label="Pocket wallet mode">
    <span aria-hidden="true" className="pocket-mode-thumb" data-stock={rail === 'xstocks'} />
    {(['stablecoins', 'xstocks'] as const).map(item => <button key={item} type="button" aria-pressed={rail === item} onClick={() => select(item)}>{item === 'stablecoins' ? 'Stablecoins' : 'XStocks'}</button>)}
  </div>
}
