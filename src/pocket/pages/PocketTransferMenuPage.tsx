import {GiftIcon} from '@heroicons/react/24/outline'
import {pocketUsdtEnabled} from '../lib/pocketBaseUsdt'
import { useNavigate } from 'react-router-dom'
import PocketRouteShell from '../components/PocketRouteShell'
import PocketFlowHeader from '../components/PocketFlowHeader'
import { Coins, Landmark, UserRound, Deposit, RequestMoney, ChevronRight } from '../components/PocketIcons'
import { POCKET_BASE_PATH, POCKET_ROUTES, pocketPathFor } from '../lib/pocketRoutes'

export default function PocketTransferMenuPage({ kind }: { kind: 'send' | 'receive' }) {
  const navigate = useNavigate()
  const open = (path: string) => navigate(POCKET_BASE_PATH + path)
  const actions = kind === 'send' ? [
    { title: 'Stablecoins USDC', detail: 'Send USDC to a wallet', Icon: Coins, path: POCKET_ROUTES.send + '?mode=address' },
    { title: 'Bank transfer', detail: 'Send to a bank account', Icon: Landmark, path: POCKET_ROUTES.bank + '?mode=withdraw' },
    { title: 'Pocket ID', detail: 'Send to a Pocket user', Icon: UserRound, path: POCKET_ROUTES.send + '?mode=pocket' },
  ] : [
    { title: pocketUsdtEnabled ? 'Deposit' : 'Deposit USDC', detail: pocketUsdtEnabled ? 'Receive USDC or USDT' : 'Receive USDC into your wallet', Icon: Deposit, path: POCKET_ROUTES.deposit },
    { title: 'Request USDC', detail: 'Request a payment', Icon: RequestMoney, path: POCKET_ROUTES.usdc },
  ]
  return <PocketRouteShell active="home" onSelect={tab => open(tab === 'bills' ? POCKET_ROUTES.bills : tab === 'profile' ? POCKET_ROUTES.profile : tab === 'activity' ? pocketPathFor({ section: 'activity', view: 'all' }) : POCKET_ROUTES.home)}>
    <PocketFlowHeader centered title={kind === 'send' ? 'Send' : 'Receive'} onBack={() => open(POCKET_ROUTES.home)} />
    <section aria-label={kind === 'send' ? 'Send options' : 'Receive options'} className="divide-y divide-gray-100 dark:divide-[#262626]">
      {<button type="button" onClick={()=>open(kind==='send'?'/gifts/send':'/gifts/claim')} className="flex min-h-20 w-full items-center gap-4 py-4 text-left"><span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><GiftIcon className="h-5 w-5"/></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{kind==='send'?'Send a gift':'Claim a gift'}</span><span className="mt-1 block text-[11px] text-gray-500">{kind==='send'?'Share a USDC gift on Base':'Open your gift link'}</span></span>{kind==='send'&&<span className="rounded-full bg-gray-100 px-2 py-1 text-[10px] font-semibold dark:bg-white/10">Fee</span>}<ChevronRight className="h-4 w-4 text-gray-500"/></button>}
      {actions.map(({title,detail,Icon,path}) => <button key={title} type="button" onClick={() => open(path)} className="flex min-h-20 w-full items-center gap-4 py-4 text-left">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 dark:bg-[#121212]"><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{title}</span><span className="mt-1 block text-[11px] text-gray-500 dark:text-gray-400">{detail}</span></span>
        <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </button>)}
    </section>
  </PocketRouteShell>
}
