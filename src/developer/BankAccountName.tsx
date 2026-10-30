import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

export default function BankAccountName({ projectId, bankCode, accountNumber, savedName }: {
  projectId: string; bankCode: string; accountNumber: string; savedName: string
}) {
  const { getAccessToken, user } = usePrivy()
  const tokenReader = useRef(getAccessToken); tokenReader.current = getAccessToken
  const identity = `${user?.id || ''}:${projectId}:${bankCode}:${accountNumber}`
  const valid = Boolean(bankCode && /^\d{10}$/.test(accountNumber))
  const [result, setResult] = useState({ identity: '', name: '', error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!valid) return
    const controller = new AbortController()
    let active = true
    const timer = window.setTimeout(async () => {
      const timeout = window.setTimeout(() => controller.abort(), 20000)
      try {
        const token = await tokenReader.current()
        if (!active) return
        if (!token) throw Error('Sign in again to verify this account.')
        const response = await fetch('/api/developer-projects', {
          method: 'POST', cache: 'no-store', signal: controller.signal,
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'verify-bank-account', projectId, bankCode, accountNumber }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.ok || !data.accountName) throw Error(data?.error || 'Could not verify this account. Try again.')
        if (active) setResult({ identity, name: data.accountName, error: '' })
      } catch (reason) {
        if (active) setResult({ identity, name: '', error: controller.signal.aborted ? 'Account verification timed out. Try again.' : reason instanceof Error ? reason.message : 'Could not verify this account. Try again.' })
      } finally { clearTimeout(timeout) }
    }, 450)
    return () => { active = false; clearTimeout(timer); controller.abort() }
  }, [identity, valid, retry, projectId, bankCode, accountNumber])
  const current = result.identity === identity ? result : null
  const pending = valid && !current
  return <div>
    <label className="block text-sm font-medium">Account name
      {pending ? <span role="status" aria-label="Verifying bank account" className="mt-2 block h-12 animate-pulse rounded-xl bg-gray-200 dark:bg-white/10" /> : <input readOnly value={accountNumber ? current?.name || '' : savedName} placeholder="Enter bank and account number" className="mt-2 h-12 w-full rounded-xl border border-gray-200 bg-transparent px-3 text-sm dark:border-white/10" />}
    </label>
    {current?.error && <div role="alert" className="mt-2 text-xs text-red-600"><p>{current.error}</p><button type="button" className="mt-1 min-h-10 font-semibold" onClick={() => { setResult({ identity: '', name: '', error: '' }); setRetry(value => value + 1) }}>Try again</button></div>}
  </div>
}
