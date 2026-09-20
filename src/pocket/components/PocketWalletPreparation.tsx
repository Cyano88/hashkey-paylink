import { useEffect, useRef, useState } from 'react'
import { prepareCircleEvmReplacement } from '../../lib/circleEvmEmailWallet'
import { unlockPocketBaseWallet } from '../controllers/usePocketWalletController'

export default function PocketWalletPreparation({ email, getAccessToken }: {
  email: string; getAccessToken(): Promise<string | null>
}) {
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [finished, setFinished] = useState(false)
  const active = useRef(false)
  const locked = useRef(false)
  useEffect(() => { active.current = true; return () => { active.current = false } }, [])
  const prepare = async () => {
    if (locked.current || finished) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try {
      // Persist only an opaque attempt ID, never wallet credentials.
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
      const owner = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
      const key = 'pocket:evm-preparation:v2:' + owner
      const attemptId = localStorage.getItem(key) || crypto.randomUUID()
      localStorage.setItem(key, attemptId)
      if (!active.current) return
      const { session } = await unlockPocketBaseWallet({ authenticated: true, email, getAccessToken })
      if (!active.current) return
      const token = await getAccessToken()
      if (!token) throw new Error('Sign in again before preparing wallets.')
      if (!active.current) return
      const result = await prepareCircleEvmReplacement(session, attemptId, token, () => active.current)
      if (!active.current) return
      if (result.status === 'matching') {
        setFinished(true)
        setNotice('The new Base, Arbitrum and Arc addresses match. Your existing wallets are still active. Balance migration must be verified before switching.')
      } else if (result.status === 'split') {
        setFinished(true)
        setError('Circle returned different addresses. Your current wallets are unchanged. This batch cannot be used as one address.')
      } else {
        setNotice('The replacement batch is not ready. Check again to verify the same attempt. Your current wallets are unchanged.')
      }
    } catch (reason) {
      if (active.current) setError(reason instanceof Error ? reason.message : 'Wallet preparation could not complete.')
    } finally {
      locked.current = false
      if (active.current) setBusy(false)
    }
  }
  return <section className='space-y-5 pt-8'>
    <article className='rounded-[26px] bg-white p-5 shadow-sm dark:bg-white/[0.05]'>
      <h2 className='text-base font-black'>Prepare matching wallets</h2>
      <p className='mt-3 text-sm leading-6 text-gray-500'>Create a replacement Base, Arbitrum and Arc batch and check whether their addresses match.</p>
      <p className='mt-3 text-sm leading-6 text-gray-500'>Your current wallets and balances remain active. This step does not transfer funds or change your deposit addresses.</p>
      <button type='button' disabled={busy || finished} onClick={() => void prepare()} className='mt-5 min-h-12 w-full rounded-full bg-gray-950 px-4 text-xs font-black text-white disabled:opacity-50 dark:bg-white dark:text-gray-950'>{busy ? 'Checking with Circle…' : finished ? 'Check complete' : 'Prepare or check wallets'}</button>
    </article>
    {notice && <p role='status' className='px-2 text-sm leading-6'>{notice}</p>}
    {error && <p role='alert' className='px-2 text-sm leading-6 text-red-500'>{error}</p>}
  </section>
}
