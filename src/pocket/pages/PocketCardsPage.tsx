import { useNavigate } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import { CreditCard, Phone, Lock, History, Store } from '../components/PocketIcons'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { POCKET_BASE_PATH, POCKET_ROUTES } from '../lib/pocketRoutes'
import './PocketCardsPage.css'

export default function PocketCardsPage() {
  const navigate = useNavigate()
  return <PocketRouteShell active="cards" refreshEnabled={false} onSelect={tab => navigate(POCKET_BASE_PATH + (tab === 'bills' ? POCKET_ROUTES.bills : tab === 'profile' ? POCKET_ROUTES.profile : tab === 'activity' ? POCKET_ROUTES.activity : tab === 'cards' ? POCKET_ROUTES.cards : POCKET_ROUTES.home))}>
    <PocketFlowHeader title="Cards" centered hideBack />
    <section aria-label="Pocket card preview" className="pocket-card-preview">
      <div className="pocket-card-stage" aria-hidden="true">
        <div className="pocket-card-halo" />
        <div className="pocket-card-shadow" />
        <div className="pocket-preview-card">
          <div className="pocket-preview-card-surface" />
          <div className="relative z-10 flex items-center gap-2">
            <img src="/pocket-mark.svg" alt="" className="h-7 w-7 invert" />
            <span className="text-xl font-semibold tracking-tight">Pocket</span>
          </div>
          <img src="/pocket-mark.svg" alt="" className="pocket-card-etch" />
          <div className="relative z-10 flex items-end justify-between">
            <span className="text-[10px] font-medium tracking-wide text-white/50">by Hash PayLink</span>
            <img src="/brand/visa-preview.png" alt="Visa" className="h-7 w-[86px] object-contain brightness-0 invert" />
          </div>
        </div>
      </div>
      <div className="mx-auto mt-6 w-full max-w-[320px]">
        <ul className="space-y-4">
          {[
            // Fyatu Visa Platinum coverage: https://fyatu.com/card-issuing/ (2026-10-09).
            { Icon: Store, title: '60M+ merchants worldwide', description: 'Visa acceptance, where supported.' },
            { Icon: CreditCard, title: 'Shop online', description: 'Pay for purchases and subscriptions.' },
            { Icon: Phone, title: 'Add to Apple Pay or Google Pay', description: 'On supported devices, where available.' },
            { Icon: Lock, title: 'Stay in control', description: 'Freeze and unfreeze your card in Pocket.' },
            { Icon: History, title: 'Follow your spending', description: 'See your card payments in one place.' },
          ].map(({ Icon, title, description }) => <li key={title} className="flex items-start gap-3">
            <Icon className="mt-0.5 h-5 w-5 shrink-0 text-gray-950 dark:text-white" aria-hidden="true" />
            <div><p className="text-sm font-medium text-gray-950 dark:text-white">{title}</p><p className="mt-0.5 text-xs leading-5 text-gray-500 dark:text-gray-400">{description}</p></div>
          </li>)}
        </ul>
      </div>
      <div className="pocket-card-availability">
        <button type="button" disabled className="pocket-cta-primary w-full">Coming soon</button>
      </div>
    </section>
  </PocketRouteShell>
}
