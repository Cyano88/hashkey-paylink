import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from '../components/PocketIcons'
import usePocketIdentity from '../hooks/usePocketIdentity'
import usePocketProfile from '../hooks/usePocketProfile'
import { TelegramHelperPanel } from '../../pages/TelegramPaymentLinks'

const WELCOME_TEXT = 'Circle Pocket is ready. Ask me about sending or receiving USDC, bank payouts, POS, bills, activity, receipts, or account support.'

export default function PocketAssistantPage() {
  const navigate = useNavigate()
  const { authenticated, email, getAccessToken } = usePocketIdentity()
  const profile = usePocketProfile({ authenticated, email, getAccessToken })
  const displayName = profile.profile?.resolvedName || 'there'
  const ownerKey = email || profile.profile?.pocketId || 'circle-pocket-web'

  return (
    <div className='fixed inset-0 z-[55] bg-white text-gray-950 dark:bg-[#0A0A0A] dark:text-white'>
      <main className='mx-auto flex h-full w-full max-w-[480px] flex-col overflow-hidden pt-[max(0.75rem,env(safe-area-inset-top))]'>
        <header className='flex h-12 shrink-0 items-center justify-between px-5'>
          <button type='button' onClick={() => navigate(-1)} className='flex h-10 w-10 items-center justify-center rounded-full bg-[#F5F5F7] dark:bg-white/[0.07]' aria-label='Back'>
            <ArrowLeft className='h-4 w-4' />
          </button>
          <div className='text-center'>
            <p className='text-sm font-black'>Agent Hash</p>
            <p className='text-[10px] font-medium text-gray-400'>Circle Pocket support</p>
          </div>
          <span className='h-10 w-10' />
        </header>
        <section className='flex min-h-0 flex-1 flex-col overflow-hidden pt-2'>
          <TelegramHelperPanel
            telegramName={displayName}
            ownerKey={ownerKey}
            telegramId=''
            fallbackOwner={ownerKey}
            initialEventId=''
            initialPayer={displayName === 'there' ? '' : displayName}
            initialHelperMode='circle-pocket'
            lockedHelperMode='circle-pocket'
            initialNotice=''
            welcomeText={WELCOME_TEXT}
            inputPlaceholder='Ask Agent Hash...'
            hideTopDivider
            fillAvailableHeight
            onRecoverTelegramName={() => undefined}
            onBack={() => navigate(-1)}
          />
        </section>
      </main>
    </div>
  )
}
