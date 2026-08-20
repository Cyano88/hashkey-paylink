import { useNavigate } from 'react-router-dom'
import PrivacyDocs from '../../pages/docs/PrivacyDocs'
import TermsDocs from '../../pages/docs/TermsDocs'
import AccountDeletionDocs from '../../pages/docs/AccountDeletionDocs'
import { ArrowLeft } from '../components/PocketIcons'
import { CPurseIcon } from '../components/CPurseIcon'
import usePocketLightSurface from '../hooks/usePocketLightSurface'

export default function PocketLegalDocumentPage({ document }: { document: 'terms' | 'privacy' | 'account-deletion' }) {
  usePocketLightSurface()
  const navigate = useNavigate()
  const title = document === 'terms' ? 'Terms and Conditions' : document === 'privacy' ? 'Privacy Policy' : 'Account deletion'

  return (
    <div className="fixed inset-0 flex h-[100dvh] min-h-0 flex-col overflow-hidden bg-white text-gray-950">
      <header className="z-20 shrink-0 border-b border-gray-200 bg-white/95 px-4 pb-3 pt-[max(0.75rem,var(--pocket-safe-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/', { replace: true })}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm active:scale-95"
            aria-label="Back to Pocket sign in"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <CPurseIcon size={34} title="" className="h-[34px] w-[34px] shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-[-0.02em]">Hash PayLink</p>
            <p className="truncate text-[11px] font-semibold text-gray-500">{title}</p>
          </div>
        </div>
      </header>
      <div data-pocket-legal-scroll className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch]">
        <main className="mx-auto w-full max-w-3xl px-6 pb-[max(3rem,var(--pocket-safe-bottom))] pt-8">
          {document === 'terms' ? <TermsDocs /> : document === 'privacy' ? <PrivacyDocs /> : <AccountDeletionDocs />}
        </main>
      </div>
    </div>
  )
}
