import { safeError } from './safe-error.mjs'
import { randomBytes } from 'node:crypto'
export async function activeManager(sessionStore) {
  const session = await sessionStore.read()
  if (!session || session.grant.state !== 'approved' || !(Date.parse(session.grant.expiresAt) > Date.now())
    || !session.grant.scopes.includes('keys:manage')) throw safeError('Owner-approved keys:manage login is required.')
  return session
}
export async function keysApi(body, { fetcher, session }) {
  const response = await fetcher('https://developer.hashpaylink.com/api/v2/cli/keys', {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
    headers: { authorization: 'Bearer ' + session.token, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const chunks = []; let size = 0
  for await (const chunk of response.body ?? []) { size += chunk.length; if (size > 131072) throw safeError('Response limit.'); chunks.push(chunk) }
  const data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!response.ok || !data.ok || data.projectId !== session.grant.projectId) {
    const configurationErrors = new Map([
      ['Select a Swap network in project settings before creating a Swap key.', 'Select Arc or X Layer under Swap in project Settings, save, then retry with the same operation id.'],
      ['xStocks Agreement keys require the separate xStocks Agreements capability.', 'Select X Layer under Agreements in project Settings, save, then retry with the same operation id.'],
      ['An active, ready human checkout project is required.', 'Save a complete human project configuration before creating this scoped key.'],
    ])
    if (response.status === 409 && data.ok === false && configurationErrors.has(data.error)) throw safeError(configurationErrors.get(data.error))
    throw safeError('Key operation failed. Keep the same operation id when retrying.')
  }
  return data
}
export async function keyCommand(command, options, { fetcher, sessionStore, vaultStore }) {
  const session = await activeManager(sessionStore)
  const context = { fetcher, session }
  if (command === 'keys list') return keysApi({ action: 'list' }, context)
  if (command === 'keys revoke') {
    if (!/^key_[a-zA-Z0-9-]{8,72}$/.test(options['key-id'] ?? '')) throw safeError('Specify a scoped key id.')
    const data = await keysApi({ action: 'revoke', keyId: options['key-id'] }, context)
    const vault = await vaultStore.read()
    if (vault) {
      vault.keys = vault.keys.filter(key => key.metadata?.id !== options['key-id'] || key.projectId !== session.grant.projectId)
      await vaultStore.write(vault)
    }
    return data
  }
  const operationId = options['idempotency-key']
  const name = options.name
  const scopes = (options.scopes ?? 'project:read,checkout:read').split(',').sort()
  const days = Number(options['expires-in-days'] ?? 30)
  if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(operationId ?? '') || !name?.trim() || name.length > 60
    || !Number.isInteger(days) || days < 1 || days > 30 || !scopes.length || new Set(scopes).size !== scopes.length
    || scopes.some(scope => !['project:read','checkout:read','checkout:create','agreement:read','agreement:create', 'agreement:recipient', 'agreement:fund','xstocks-agreement:read','wallet:connect', 'wallet:arc', 'wallet:stocks:read', 'wallet:swap', 'xstocks-agreement:create'].includes(scope) || !session.grant.scopes.includes(scope))) throw safeError('Invalid key inputs or permissions exceed the approved grant.')
  const vault = await vaultStore.read() ?? { keys: [], plans: [] }
  let entry = vault.keys.find(key => key.operationId === operationId && key.projectId === session.grant.projectId)
  const spec = { name: name.trim(), scopes, expiresInDays: days }
  if (entry && JSON.stringify(entry.spec) !== JSON.stringify(spec)) throw safeError('Operation id was used with different key inputs.')
  if (!entry) {
    if (vault.keys.length >= 20) throw safeError('Local key vault is full. Revoke unused keys first.')
    entry = { projectId: session.grant.projectId, operationId, spec, value: 'hpl_app_' + randomBytes(32).toString('hex') }
    vault.keys.push(entry)
    // Persist before submitting, so an uncertain response can be retried safely.
    await vaultStore.write(vault)
  }
  const data = await keysApi({ action: 'create', operationId, apiKey: entry.value, ...spec }, context)
  if (!data.key?.id || !data.key.expiresAt) throw safeError('Incomplete key response. Retry the same operation id.')
  entry.metadata = data.key
  await vaultStore.write(vault)
  return { ok: true, projectId: entry.projectId, replayed: data.replayed, key: data.key, secretStoredLocally: true }
}
