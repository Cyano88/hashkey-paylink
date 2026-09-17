import { safeError } from './safe-error.mjs'
import { createHash, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join, delimiter, isAbsolute } from 'node:path'
import { activeManager, keysApi } from './key-management.mjs'
const VARIABLE = 'HASHPAYLINK_API_KEY'
const digest = value => createHash('sha256').update(value === undefined ? 'absent' : 'value:' + value).digest('hex')
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
export function railwayRun(args, input, env = process.env) {
  let binary = 'railway'
  if (process.platform === 'win32') {
    const candidates = (env.PATH ?? env.Path ?? '').split(delimiter).filter(isAbsolute)
      .flatMap(path => [join(path, 'railway.exe'), join(path, 'node_modules', '@railway', 'cli', 'bin', 'railway.exe')])
    binary = candidates.find(existsSync)
    if (!binary) throw safeError('Install the official Railway CLI with a native executable.')
  }
  const allowedEnv = new Set(['PATH','HOME','USERPROFILE','APPDATA','LOCALAPPDATA','SYSTEMROOT','WINDIR','TEMP','TMP','COMSPEC','HOMEDRIVE','HOMEPATH','RAILWAY_TOKEN','RAILWAY_API_TOKEN','SSL_CERT_FILE','SSL_CERT_DIR','HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','LANG','LC_ALL'])
  const providerEnv = Object.fromEntries(Object.entries(env).filter(([name]) => allowedEnv.has(name.toUpperCase())))
  providerEnv.NO_COLOR = '1'
  const result = spawnSync(binary, args, { input, env: providerEnv, encoding: 'utf8', shell: false,
    windowsHide: true, timeout: 30000, maxBuffer: 1048576 })
  if (result.error || result.status !== 0) throw safeError('Railway operation failed. Check provider authorization and explicit target IDs.')
  // Provider output may contain secrets. It is consumed internally, never echoed.
  try { return JSON.parse(result.stdout) } catch { throw safeError('Railway returned an unsupported response.') }
}
export function providerAdapter({ env, fetcher, railway = railwayRun }) {
  async function render(path, method = 'GET', body) {
    if (!env.RENDER_API_KEY) throw safeError('Render requires separate RENDER_API_KEY authorization.')
    const response = await fetcher('https://api.render.com/v1' + path, { method, redirect: 'error', signal: AbortSignal.timeout(20000),
      headers: { authorization: 'Bearer ' + env.RENDER_API_KEY, accept: 'application/json', ...(body ? {'content-type':'application/json'} : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) })
    if (response.status === 404 && method === 'GET' && path.includes('/env-vars/')) return undefined
    if (!response.ok) throw safeError('Render rejected the operation. Check provider authorization and service ID.')
    const chunks=[]; let size=0
    for await(const chunk of response.body ?? []) { size+=chunk.length; if(size>131072) throw safeError('Provider response limit.'); chunks.push(chunk) }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw safeError('Invalid provider response.') }
  }
  const flags = target => ['--project', target.project, '--environment', target.environment, '--service', target.service, '--json']
  return {
    async read(target) {
      if (target.provider === 'render') {
        const service = await render('/services/' + target.service)
        if (service?.id !== target.service || !['web_service','private_service','background_worker','cron_job'].includes(service.type)) throw safeError('Select a supported backend Render service, not a static site.')
        const variable = await render('/services/' + target.service + '/env-vars/' + VARIABLE)
        const value = variable?.value ?? variable?.envVar?.value
        if (variable !== undefined && typeof value !== 'string') throw safeError('Unknown provider variable response.')
        return { label: service.name, value }
      }
      const status = await railway(['status', '--project', target.project, '--environment', target.environment, '--json'], undefined, env)
      const environment = status.environments?.edges?.find(edge => edge.node.id === target.environment)?.node
      const service = status.services?.edges?.find(edge => edge.node.id === target.service)?.node
      if (status.id !== target.project || !environment || !service) throw safeError('Railway target does not match the selected project, environment and service.')
      const vars = await railway(['variable','list', ...flags(target)], undefined, env)
      if (!vars || typeof vars !== 'object' || Array.isArray(vars) || (vars[VARIABLE] !== undefined && typeof vars[VARIABLE] !== 'string')) throw safeError('Invalid Railway variables response.')
      return { label: status.name + ' / ' + environment.name + ' / ' + service.name, value: vars[VARIABLE] }
    },
    async write(target, value) {
      if (target.provider === 'render') await render('/services/' + target.service + '/env-vars/' + VARIABLE, 'PUT', { value })
      else {
        const result = await railway(['variable','set',VARIABLE,'--stdin','--skip-deploys', ...flags(target)], value, env)
        if (result?.set !== true || !result.keys?.includes(VARIABLE)) throw safeError('Railway did not confirm the variable update.')
      }
    },
  }
}
function validateTarget(options) {
  const target = { provider: options.provider, service: options.service }
  if (target.provider === 'render') {
    if (!/^srv-[a-z0-9]{8,40}$/.test(target.service ?? '') || options.project || options.environment) throw safeError('Render requires an explicit service ID only.')
  } else if (target.provider === 'railway') {
    if (![target.service, options.project, options.environment].every(value => uuid.test(value ?? ''))) throw safeError('Railway requires explicit project, environment and service UUIDs.')
    target.project = options.project; target.environment = options.environment
  } else throw safeError('Choose render or railway.')
  if (!options.backend) throw safeError('Confirm a backend target with --backend. Secrets must not be bundled into a frontend.')
  return target
}
export async function hostingCommand(command, options, deps) {
  const { fetcher, sessionStore, vaultStore } = deps
  const session = await activeManager(sessionStore)
  const vault = await vaultStore.read()
  if (!vault) throw safeError('Create a scoped key in this CLI first.')
  let plan, entry
  const provider = deps.provider ?? providerAdapter(deps)
  if (command === 'hosting plan') {
    const target = validateTarget(options)
    entry = vault.keys.find(key => key.projectId === session.grant.projectId && key.metadata?.id === options['key-id'])
    if (!entry) throw safeError('Select a locally stored scoped key for the authorized Hash PayLink project.')
    const live = await keysApi({action:'list'}, {fetcher, session})
    const remote = live.keys.find(key => key.id === entry.metadata.id && !key.revokedAt && Date.parse(key.expiresAt) > Date.now())
    if (!remote) throw safeError('Scoped key is inactive.')
    const current = await provider.read(target)
    const replace = current.value !== undefined && current.value !== entry.value
    if (replace && !options.replace) throw safeError('The variable already exists. Review the target and explicitly use --replace to plan replacement.')
    plan = { id: randomUUID(), target, label: current.label, keyId: entry.metadata.id, projectId: entry.projectId,
      expected: digest(current.value), replace, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 900000).toISOString(), state: 'planned' }
    vault.plans = [...(vault.plans ?? []).slice(-9), plan]
    await vaultStore.write(vault)
    return { ok:true, plan: { id:plan.id, target, label:plan.label, keyId:plan.keyId, projectId:plan.projectId,
      variable:VARIABLE, replace, variableScope: target.provider === 'render' ? 'Service-local; may override an inherited environment-group value' : 'Selected service and environment', expiresAt:plan.expiresAt, deploy:false }, next:'Review the target, then run hosting apply --plan ' + plan.id }
  }
  if (!uuid.test(options.plan ?? '')) throw safeError('Specify a reviewed hosting plan ID.')
  plan = vault.plans?.find(item => item.id === options.plan && item.projectId === session.grant.projectId)
  if (!plan || Date.parse(plan.expiresAt) <= Date.now()) throw safeError('Hosting plan is missing or expired. Create a new plan.')
  entry = vault.keys.find(key => key.projectId === plan.projectId && key.metadata?.id === plan.keyId)
  if (!entry) throw safeError('Local key is unavailable.')
  const live = await keysApi({action:'list'}, {fetcher, session})
  if (!live.keys.some(key => key.id === plan.keyId && !key.revokedAt && Date.parse(key.expiresAt) > Date.now())) throw safeError('Scoped key is inactive.')
  const current = await provider.read(plan.target)
  if (current.value !== entry.value) {
    if (digest(current.value) !== plan.expected) throw safeError('The provider variable changed since planning. Review a new plan.')
    await provider.write(plan.target, entry.value)
  }
  const confirmed = await provider.read(plan.target)
  if (confirmed.value !== entry.value) throw safeError('Provider readback did not match. Retry this same plan to reconcile; do not create another key.')
  plan.state = 'applied'; plan.appliedAt = new Date().toISOString()
  await vaultStore.write(vault)
  return {ok:true, planId:plan.id, target:plan.target, keyId:plan.keyId, variable:VARIABLE, verified:true, deploymentTriggered:false}
}
