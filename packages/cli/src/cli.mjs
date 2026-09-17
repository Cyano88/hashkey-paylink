const ORIGIN = 'https://developer.hashpaylink.com'
const HELP = `Hash PayLink CLI 0.1.0
Commands:
  project show
  doctor
  checkout create --amount 2 --idempotency-key <stable-order-key>
    [--title <text>] [--description <text>] [--return-url <https-url>]
    [--expires-in-minutes 60] [--dry-run]
  checkout status --id <checkout-id>
  agent-prompt
Options: --json --no-interactive --help --version
Authentication: inject HASHPAYLINK_API_KEY through your environment/secret manager.
Keys are never accepted as arguments or saved by this CLI.
Creation uses human hosted checkout with dashboard-managed settlement routing.
Status reads server-recorded payment state; it does not initiate verification.
No automatic retries, polling, signing, transfers, swaps or key administration.
`
class CliError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status }
}
const invalid = message => { throw new CliError('INVALID_ARGUMENT', message) }
function parse(argv) {
  const words = [], options = Object.create(null)
  const booleans = new Set(['json', 'no-interactive', 'help', 'version', 'dry-run'])
  const values = new Set(['amount', 'idempotency-key', 'title', 'description', 'return-url', 'expires-in-minutes', 'id'])
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) { words.push(arg); continue }
    const name = arg.slice(2)
    if (!booleans.has(name) && !values.has(name)) invalid('Unknown option. Use --help for supported options.')
    if (Object.hasOwn(options, name)) invalid('Repeated options are not supported.')
    if (booleans.has(name)) options[name] = true
    else {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith('--')) invalid('An option value is missing.')
      options[name] = argv[++i]
    }
  }
  return { command: words.join(' '), options }
}
function createBody(options) {
  const amount = options.amount
  if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(amount ?? '') || !/[1-9]/.test(amount)) invalid('Amount must be positive USDC with at most six decimal places.')
  if (!/^[a-zA-Z0-9:_-]{16,128}$/.test(options['idempotency-key'] ?? '')) invalid('Use a stable idempotency key of 16-128 letters, digits, colons, underscores or hyphens. Reuse it when retrying the same order.')
  const body = { kind: 'usdc_request', checkoutMode: 'human', amount }
  for (const [flag, name, limit] of [['title', 'title', 100], ['description', 'description', 240]]) {
    if (options[flag] !== undefined) {
      if (!options[flag].trim() || options[flag].length > limit) invalid(name + ' has an invalid length.')
      body[name] = options[flag]
    }
  }
  if (options['return-url'] !== undefined) {
    let url
    try { url = new URL(options['return-url']) } catch { invalid('return-url must be a valid HTTPS URL.') }
    if (url.protocol !== 'https:' || url.username || url.password || url.href.length > 300) invalid('return-url must be HTTPS without embedded credentials and at most 300 characters.')
    body.returnUrl = url.href
  }
  if (options['expires-in-minutes'] !== undefined) {
    const value = options['expires-in-minutes']
    if (!/^\d+$/.test(value) || Number(value) < 5 || Number(value) > 1440) invalid('Expiry must be a whole number between 5 and 1440 minutes.')
    body.expiresInMinutes = Number(value)
  }
  return body
}
async function request(path, { key, fetcher, body, idempotencyKey }) {
  if (!/^hpl_live_[a-zA-Z0-9_-]+$/.test(key ?? '') || key.length > 240) throw new CliError('AUTH_REQUIRED', 'Inject a live project key as HASHPAYLINK_API_KEY. Create or revoke keys in the developer portal.')
  let response, data
  try {
    response = await fetcher(ORIGIN + path, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(20_000),
      headers: { Accept: 'application/json', 'X-API-Key': key,
        ...(body ? { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    let size = 0
    const chunks = []
    for await (const chunk of response.body ?? []) {
      size += chunk.length
      if (size > 262144) throw new Error('Response limit')
      chunks.push(chunk)
    }
    data = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new CliError('REQUEST_FAILED', 'Request failed or returned an unreadable response. Creation may have succeeded; retry only with the same idempotency key.')
  }
  if (!response.ok || data?.ok !== true) {
    const status = response.status
    const code = status === 401 || status === 403 ? 'ACCESS_DENIED' : status === 409 ? 'CONFLICT' : status === 429 ? 'RATE_LIMITED' : 'API_ERROR'
    throw new CliError(code, 'API rejected the request (HTTP ' + status + '). Check project configuration and inputs.', status)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new CliError('INVALID_RESPONSE', 'Invalid API response.')
  return data
}
export async function run(argv, { env = process.env, fetcher = globalThis.fetch, stdout = process.stdout, stderr = process.stderr } = {}) {
  const json = argv.includes('--json')
  const key = env.HASHPAYLINK_API_KEY
  const emit = (value, error = false) => {
    let text = typeof value === 'string' ? value : JSON.stringify(value, null, json ? 0 : 2)
    if (key) text = text.split(key).join('[REDACTED]')
    text = text.replace(/hpl_(?:live|test)_[a-zA-Z0-9_-]+/g, '[REDACTED]')
    ;(error && !json ? stderr : stdout).write(text + '\n')
  }
  try {
    const { command, options } = parse(argv)
    if (options.help || !command && !options.version) { emit(json ? { ok: true, help: HELP } : HELP); return 0 }
    if (options.version) { emit(json ? { ok: true, version: '0.1.0' } : '0.1.0'); return 0 }
    const allowed = {
      'project show': [], doctor: [], 'agent-prompt': [],
      'checkout status': ['id'],
      'checkout create': ['amount', 'idempotency-key', 'title', 'description', 'return-url', 'expires-in-minutes', 'dry-run'],
    }
    if (!Object.hasOwn(allowed, command)) invalid('Unknown command. Use --help for supported commands.')
    if (Object.keys(options).some(name => !['json', 'no-interactive'].includes(name) && !allowed[command].includes(name))) invalid('An option is not supported for this command.')
    if (command === 'agent-prompt') {
      emit({ ok: true, instructions: 'Use hashpaylink with --json --no-interactive. Inject HASHPAYLINK_API_KEY through a secret manager; never print it or put it in arguments. Run doctor first. Before checkout create, use --dry-run and obtain task authorization. Use one stable idempotency key per order and retain it for retries. Read checkout status on demand; do not continuously poll. Pending is not paid. Do not infer payment from redirects, checkout creation or a transaction hash. This CLI cannot sign, transfer, swap, change settlement or administer keys.' })
      return 0
    }
    const context = { key, fetcher }
    if (command === 'project show' || command === 'doctor') {
      const data = await request('/api/v2/project', context)
      if (!data.project?.id) throw new CliError('INVALID_RESPONSE', 'Project response is incomplete.')
      emit({ ok: true, ...(command === 'doctor' ? { authenticated: true, apiReachable: true } : {}), project: data.project })
    } else if (command === 'checkout create') {
      const body = createBody(options)
      if (options['dry-run']) emit({ ok: true, dryRun: true, validation: 'local_only', method: 'POST', path: '/api/v2/checkouts', body, idempotencyKey: options['idempotency-key'] })
      else {
        const data = await request('/api/v2/checkouts', { ...context, body, idempotencyKey: options['idempotency-key'] })
        if (!data.checkoutId || !data.checkoutUrl) throw new CliError('INVALID_RESPONSE', 'Checkout response is incomplete. Retry only with the same idempotency key.')
        emit(data)
      }
    } else {
      if (!/^chk_[a-zA-Z0-9]{8,40}$/.test(options.id ?? '')) invalid('A valid checkout id is required.')
      const data = await request('/api/v2/checkouts?id=' + encodeURIComponent(options.id) + '&purpose=status', context)
      if (data.checkoutId !== options.id || typeof data.status !== 'string') throw new CliError('INVALID_RESPONSE', 'Checkout status response is incomplete.')
      emit(data)
    }
    return 0
  } catch (error) {
    emit({ ok: false, error: { code: error instanceof CliError ? error.code : 'INTERNAL_ERROR', message: error instanceof CliError ? error.message : 'Command failed.', ...(error instanceof CliError && error.status ? { status: error.status } : {}) } }, true)
    return 1
  }
}
