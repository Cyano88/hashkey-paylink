import { randomBytes, createHash } from 'node:crypto'
async function send(fetcher, body, token) {
  const response = await fetcher('https://developer.hashpaylink.com/api/v2/cli/auth', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  })
  let length = 0
  const chunks = []
  for await (const chunk of response.body ?? []) {
    length += chunk.length
    if (length > 32768) throw new Error('Authorization response was too large.')
    chunks.push(chunk)
  }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!response.ok || !data.ok || !data.grant?.id) throw new Error('Authorization request failed. Retry or check access in the developer portal.')
  return data
}
export async function authCommand(command, options, { fetcher, sessionStore }) {
  if (command === 'auth login') {
    if (!/^dev_[a-z0-9]{8,64}$/i.test(options.project ?? '')) throw new Error('Specify an existing developer project with --project.')
    const scopes = (options.scopes ?? 'project:read,checkout:read').split(',')
    const allowed = ['project:read', 'checkout:read', 'checkout:create', 'agreement:read', 'agreement:create', 'agreement:recipient', 'agreement:fund', 'xstocks-agreement:read', 'wallet:connect', 'wallet:arc', 'xstocks-agreement:create', 'keys:manage']
    if (!scopes.length || scopes.some(scope => !allowed.includes(scope)) || new Set(scopes).size !== scopes.length) throw new Error('Unsupported CLI scope.')
    if (await sessionStore.read()) throw new Error('Run auth logout before starting another login.')
    const token = 'hpl_cli_' + randomBytes(32).toString('hex')
    const data = await send(fetcher, { action: 'begin', projectId: options.project, scopes, challenge: createHash('sha256').update(token).digest('hex') })
    if (data.grant.state !== 'pending' || data.grant.projectId !== options.project
      || JSON.stringify(data.grant.scopes) !== JSON.stringify(scopes)
      || !/^[A-F0-9]{12}$/.test(data.userCode ?? '')
      || data.verificationUrl !== 'https://developer.hashpaylink.com/cli/authorize?id=' + data.grant.id) throw new Error('Invalid authorization response.')
    await sessionStore.write({ token, grant: data.grant })
    return { ok: true, state: 'pending', verificationUrl: data.verificationUrl, userCode: data.userCode,
      projectId: options.project, scopes, expiresAt: data.grant.requestExpiresAt,
      next: 'Open the approval URL, sign in as the project owner, enter this confirmation code, then run hashpaylink auth complete.' }
  }
  const session = await sessionStore.read()
  if (!session) {
    if (command === 'auth logout' || command === 'auth status') return { ok: true, state: 'signed_out' }
    throw new Error('Run auth login first.')
  }
  const expiry = Date.parse(session.grant.expiresAt ?? session.grant.requestExpiresAt)
  if (command === 'auth logout' && Number.isFinite(expiry) && expiry + 60000 < Date.now()) {
    await sessionStore.clear()
    return { ok: true, state: 'signed_out' }
  }
  const data = await send(fetcher, { action: command === 'auth logout' ? 'logout' : 'status' }, session.token)
  if (data.grant.id !== session.grant.id || data.grant.projectId !== session.grant.projectId
    || JSON.stringify(data.grant.scopes) !== JSON.stringify(session.grant.scopes)) throw new Error('Authorization response does not match this session.')
  if (command === 'auth logout') {
    if (data.grant.state !== 'revoked' && data.grant.state !== 'expired') throw new Error('Access was not revoked. Retry logout.')
    await sessionStore.clear()
    return { ok: true, state: 'signed_out' }
  }
  if (command === 'auth complete') {
    if (data.grant.state !== 'approved' || Date.parse(data.grant.expiresAt) <= Date.now() || !Number.isFinite(Date.parse(data.grant.expiresAt))) throw new Error('Access is not approved or has expired. Review the request in the developer portal.')
    await sessionStore.write({ token: session.token, grant: data.grant })
  }
  return { ok: true, grant: data.grant }
}
