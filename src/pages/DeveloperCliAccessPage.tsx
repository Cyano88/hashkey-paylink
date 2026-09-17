import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { usePrivy } from '@privy-io/react-auth'
import PocketEmailLogin from '../pocket/components/PocketEmailLogin'

type Grant = { id: string; projectId: string; scopes: string[]; state: string; expiresAt?: string; requestExpiresAt: string }
const labels: Record<string, string> = {
  'project:read': 'Read project configuration',
  'checkout:read': 'Read checkout payment status',
  'checkout:create': 'Create hosted checkouts',
}
export default function DeveloperCliAccessPage() {
  const { ready, authenticated, getAccessToken } = usePrivy()
  const [params] = useSearchParams()
  const id = params.get('id') ?? ''
  const [grant, setGrant] = useState<Grant | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [projectId, setProjectId] = useState('')
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function api(body: Record<string, unknown>) {
    const token = await getAccessToken()
    if (!token) throw new Error('Sign in again to continue.')
    const response = await fetch('/api/v2/cli/auth', { method: 'POST', headers: {
      'content-type': 'application/json', authorization: 'Bearer ' + token,
    }, body: JSON.stringify(body) })
    const data = await response.json().catch(() => null)
    if (!response.ok || !data?.ok) throw new Error(data?.error || 'Access could not be loaded. Try again.')
    return data
  }
  useEffect(() => {
    if (!ready || !authenticated) return
    let cancelled = false
    setError(''); setGrant(null); setName('')
    if (id) {
      void api({ action: 'inspect', id }).then(data => { if (!cancelled) { setGrant(data.grant); setName(data.projectName) } })
        .catch(reason => { if (!cancelled) setError(reason.message) })
    } else {
      void getAccessToken().then(async token => {
        if (!token) throw new Error('Sign in again to continue.')
        const response = await fetch('/api/developer-projects', { headers: { authorization: 'Bearer ' + token } })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.ok) throw new Error('Projects could not be loaded.')
        if (!cancelled) setProjects((data.projects ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))
      }).catch(reason => { if (!cancelled) setError(reason.message) })
    }
    return () => { cancelled = true }
  }, [ready, authenticated, id]) // eslint-disable-line react-hooks/exhaustive-deps
  async function act(action: string, targetId = id) {
    setBusy(true); setError('')
    try {
      const data = await api({ action, id: targetId, projectId, userCode: code })
      if (action === 'list') setGrants(data.grants)
      else if (id) setGrant(data.grant)
      else setGrants(current => current.map(g => g.id === targetId ? data.grant : g))
      setCode('')
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Request failed.') }
    finally { setBusy(false) }
  }
  const button = 'rounded-xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-gray-950'
  return <main className="mx-auto max-w-5xl px-4 py-12">
    <Link to="/" className="text-sm text-gray-500">Back to developer platform</Link>
    <section className="mt-6 grid overflow-hidden rounded-[2rem] border border-gray-200 bg-white dark:border-white/10 dark:bg-[#101114] lg:grid-cols-2">
      <div className="bg-[#050609] p-8 text-white sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-widest text-blue-300">Hash PayLink CLI</p>
        <h1 className="mt-5 text-3xl font-semibold">{id ? 'Approve CLI access' : 'Manage CLI access'}</h1>
        <p className="mt-4 text-sm leading-6 text-white/60">Access lasts one hour and applies to one project. You can revoke it here at any time.</p>
        <p className="mt-4 text-sm leading-6 text-white/60">This access cannot create API keys, change receiving wallets, sign payments, move funds, or access Render or Railway.</p>
        {id && <p className="mt-8 text-sm leading-6 text-white/80">Approve only a request you started. Enter the confirmation code from your own terminal or trusted agent session.</p>}
      </div>
      <div className="p-8 sm:p-10">
        {!ready ? <p>Loading sign-in...</p> : !authenticated ? <><h2 className="mb-6 text-xl font-semibold">Sign in to review access</h2><PocketEmailLogin context="developer" /></> : <>
          {grant && <><h2 className="text-xl font-semibold">{name}</h2><p className="mt-2 break-all text-xs text-gray-500">{grant.projectId}</p>
            <ul className="my-5 space-y-2 text-sm">{grant.scopes.map(scope => <li key={scope}>{labels[scope] ?? scope}</li>)}</ul>
            <p className="mb-5 text-sm">Status: {grant.state}{grant.expiresAt ? ' · Expires ' + new Date(grant.expiresAt).toLocaleString() : ''}</p>
            {grant.state === 'pending' && <><label htmlFor="cli-code" className="block text-sm">Confirmation code</label><input id="cli-code" autoComplete="off" value={code} maxLength={12} onChange={event => setCode(event.target.value.toUpperCase())} className="my-3 h-11 w-full rounded-xl border border-gray-200 bg-transparent px-3 font-mono dark:border-white/20" />
              <button className={button} disabled={busy || !/^[A-F0-9]{12}$/.test(code)} onClick={() => void act('approve')}>Approve for one hour</button></>}
            {['pending', 'approved'].includes(grant.state) && <button className="ml-4 py-3 text-sm text-red-600 disabled:opacity-40" disabled={busy} onClick={() => void act('revoke')}>{grant.state === 'pending' ? 'Deny' : 'Revoke access'}</button>}
            {grant.state === 'approved' && <p className="mt-5 text-sm text-gray-500">Return to your terminal and run <code>hashpaylink auth complete</code>.</p>}
          </>}
          {!id && <><label htmlFor="cli-project" className="block text-sm">Project</label><select id="cli-project" value={projectId} onChange={event => { setProjectId(event.target.value); setGrants([]) }} className="my-3 h-11 w-full rounded-xl border bg-transparent px-3"><option value="">Select a project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select><button className={button} disabled={busy || !projectId} onClick={() => void act('list')}>View access</button>
            <ul className="mt-6 divide-y divide-gray-200">{grants.map(g => <li key={g.id} className="py-4"><p className="break-all font-mono text-xs">{g.id}</p><p className="mt-2 text-sm">{g.state} · {g.scopes.map(s => labels[s]).join(', ')}</p>{['pending', 'approved'].includes(g.state) && <button className="mt-3 text-sm text-red-600" disabled={busy} onClick={() => void act('revoke', g.id)}>Revoke access</button>}</li>)}</ul></>}
        </>}
        {error && <p role="alert" className="mt-5 text-sm text-red-600">{error}</p>}
        {id && <Link to="/cli/authorize" className="mt-8 block text-sm text-blue-600">Manage CLI access</Link>}
      </div>
    </section>
  </main>
}
