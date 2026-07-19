import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map(process.argv.slice(2).map(arg => {
  const [key, ...rest] = arg.split('=')
  return [key.replace(/^--/, ''), rest.join('=') || 'true']
}))
const baseUrl = args.get('base') || process.env.STREAMPAY_SMOKE_BASE_URL || ''
const apiBaseUrl = args.get('api-base') || process.env.STREAMPAY_SMOKE_API_BASE_URL || ''

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function buildGateLink({ contentId, creator, rateRaw, capRaw, title, mode }) {
  const p = new URLSearchParams()
  p.set('app', 'streampay')
  p.set('id', contentId)
  p.set('cr', creator)
  p.set('r', String(rateRaw))
  p.set('cap', String(capRaw))
  p.set('mode', mode)
  p.set('pay', mode === 'unlock' ? 'x402' : 'poa')
  if (title.trim()) p.set('t', title.trim())
  return `/gate?${p.toString()}`
}

function resolvePaymentMode(search) {
  const params = new URLSearchParams(search)
  const gateMode = params.get('mode') === 'stream' ? 'stream' : 'unlock'
  const requestedPaymentMode = params.get('pay')
  return gateMode === 'unlock' && requestedPaymentMode !== 'poa' ? 'x402' : 'poa'
}

async function readSource(relativePath) {
  return readFile(resolve(root, relativePath), 'utf8')
}

async function assertSourceContracts() {
  const [linkFactory, apiContent, streamGate, creatorPage, streamPayApp, appRouter, server] = await Promise.all([
    readSource('modules/streampay/src/components/creator/LinkFactory.tsx'),
    readSource('modules/streampay/api/content.ts'),
    readSource('modules/streampay/src/components/creator/StreamGate.tsx'),
    readSource('modules/streampay/src/components/creator/CreatorPage.tsx'),
    readSource('modules/streampay/src/StreamPayApp.tsx'),
    readSource('src/App.tsx'),
    readSource('server.ts'),
  ])

  assert(
    linkFactory.includes("p.set('pay', params.mode === 'unlock' ? 'x402' : 'poa')"),
    'LinkFactory must add pay=x402 for unlock links and pay=poa for stream links.',
  )
  assert(
    apiContent.includes("p.set('pay', params.mode === 'unlock' ? 'x402' : 'poa')"),
    'Server content gate links must add pay=x402 for unlock links and pay=poa for stream links.',
  )
  assert(
    streamGate.includes("gateMode === 'unlock' && requestedPaymentMode !== 'poa'"),
    'StreamGate must default fixed-price unlocks to x402 unless pay=poa is explicit.',
  )
  assert(
    [
      'Pay {formatUsdc(sessionCap)} USDC with your reader wallet',
      'Choose reader wallet',
      'Open reader wallet',
      'Prepare reader payment',
      'Activate payment balance',
      'Amount to activate',
      'Check status',
      'Activate reader payment',
      'Payment balance activated. You can unlock now.',
      'Creator payment sent',
    ].every(text => streamGate.includes(text)),
    'Reader x402 unlock flow must expose clear wallet, funding, activation, and success states.',
  )
  assert(
    streamGate.includes('onClick={activatePaymentBalance}') && streamGate.includes('onClick={checkPaymentActivation}'),
    'Reader funding step must expose activation and status-check actions.',
  )
  assert(
    streamGate.includes('sm:grid-cols-[1fr_auto]') && streamGate.includes('sm:w-auto'),
    'Reader funding controls must stack on mobile and only compact on wider screens.',
  )
  assert(
    linkFactory.includes('Pending Discover review') && linkFactory.includes('Private link works now.'),
    'Creator publish success must show private gate readiness and Discover review status.',
  )
  assert(
    linkFactory.includes('grid gap-2 sm:grid-cols-2'),
    'Creator publish action buttons must stack on mobile.',
  )
  assert(
    creatorPage.includes('sm:grid-cols-[96px_1fr]') && creatorPage.includes('aspect-video w-full'),
    'Creator admin review cards must use mobile-safe media layout.',
  )
  assert(
    creatorPage.includes('readCreatorAdminJson') && creatorPage.includes('Creator approval API is unavailable. Start the local backend on port 3000'),
    'Creator admin must handle empty or non-JSON API/proxy responses with a useful error.',
  )
  assert(
    apiContent.includes("where review_status = 'approved'") && apiContent.includes("entry.reviewStatus === 'approved'"),
    'Discover API must return only approved Creator posts.',
  )
  assert(
    apiContent.includes('function requireCreatorAdmin') && apiContent.includes("headers['x-creator-admin-key']"),
    'Creator review API must require the creator admin key.',
  )
  assert(
    server.includes("app.get('/api/admin/creator-content'") && server.includes("app.post('/api/admin/creator-content'"),
    'Creator admin list and review endpoints must be registered.',
  )
  assert(
    streamPayApp.includes('path="creator-admin"') && creatorPage.includes('CreatorAdminPage'),
    'Creator admin page must be reachable at /creator-admin.',
  )
  assert(
    appRouter.includes("pathname === '/creator-admin'") && appRouter.includes("pathname === '/creator'"),
    'Root app router must mount StreamPay for direct Creator and Creator admin routes.',
  )
  assert(
    creatorPage.includes("published.filter(card => card.reviewStatus === 'approved')"),
    'Discover UI must include only approved session posts.',
  )
}

function assertUrlContracts() {
  const creator = '0x823c31d5e373dd3fa7cad59af05fa45e3858556c'
  const unlock = buildGateLink({
    contentId: 'creator-smoke-unlock',
    creator,
    rateRaw: 1000,
    capRaw: 100000,
    title: 'Creator smoke unlock',
    mode: 'unlock',
  })
  const stream = buildGateLink({
    contentId: 'creator-smoke-stream',
    creator,
    rateRaw: 1000,
    capRaw: 100000,
    title: 'Creator smoke stream',
    mode: 'stream',
  })

  assert(unlock.includes('mode=unlock'), 'Unlock link must include mode=unlock.')
  assert(unlock.includes('pay=x402'), 'Unlock link must include pay=x402.')
  assert(stream.includes('mode=stream'), 'Stream link must include mode=stream.')
  assert(stream.includes('pay=poa'), 'Stream link must include pay=poa.')

  assert(resolvePaymentMode('mode=unlock') === 'x402', 'Unlocks without pay= must default to x402.')
  assert(resolvePaymentMode('mode=unlock&pay=x402') === 'x402', 'Unlocks with pay=x402 must use x402.')
  assert(resolvePaymentMode('mode=unlock&pay=poa') === 'poa', 'Unlocks with pay=poa must preserve PoA fallback.')
  assert(resolvePaymentMode('mode=stream') === 'poa', 'Streams must default to PoA.')
  assert(resolvePaymentMode('mode=stream&pay=x402') === 'poa', 'Streams must not switch to x402.')

  return { unlock, stream }
}

async function assertRoute(base, path) {
  const res = await fetch(new URL(path, base))
  assert(res.ok, `${path} returned HTTP ${res.status}.`)
}

async function assertStatus(base, path, expectedStatuses) {
  const res = await fetch(new URL(path, base))
  assert(
    expectedStatuses.includes(res.status),
    `${path} returned HTTP ${res.status}; expected ${expectedStatuses.join(' or ')}.`,
  )
}

async function main() {
  await assertSourceContracts()
  const links = assertUrlContracts()

  if (baseUrl) {
    await assertRoute(baseUrl, '/creator')
    await assertRoute(baseUrl, '/creator-admin')
    await assertRoute(baseUrl, links.unlock)
    await assertRoute(baseUrl, links.stream)
  }

  if (apiBaseUrl) {
    await assertRoute(apiBaseUrl, '/api/creator-discover-content')
    await assertStatus(apiBaseUrl, '/api/admin/creator-content?status=pending', [401, 503])
  }

  console.log('StreamPay Creator smoke passed.')
  console.log(`unlock: ${links.unlock}`)
  console.log(`stream: ${links.stream}`)
  if (baseUrl) console.log(`routes: ${baseUrl}`)
  if (apiBaseUrl) console.log(`api routes: ${apiBaseUrl}`)
}

main().catch(error => {
  console.error(`StreamPay Creator smoke failed: ${error.message}`)
  process.exit(1)
})
