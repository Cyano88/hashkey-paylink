import type { PocketEsimDestination } from '../../src/pocket/lib/pocketEsim.js'

const ORIGIN = 'https://api.esimaccess.com/api/v1/open'
type Json = Record<string, any>
const coverage = (value: unknown) => typeof value === 'string' ? [...new Set(value.split(',').map(code => code.trim()).filter(Boolean))].sort() : []

export function normalizeEsimCatalog(rows: Json[], locations: Json[] = []): PocketEsimDestination[] {
  const groups = new Map<string, PocketEsimDestination>()
  for (const row of rows) {
    // Fixed-volume base plans only. Daily plans need a separate duration/price flow.
    if (!row || typeof row.packageCode !== 'string' || !row.packageCode || Number(row.dataType) !== 1 || row.durationUnit !== 'DAY'
      || !Number.isInteger(row.duration) || row.duration <= 0 || !Number.isSafeInteger(row.volume) || row.volume <= 0) continue
    const codes = coverage(row.location)
    if (!codes.length) continue
    const region = codes.length > 1 || !/^[A-Z]{2}$/.test(codes[0])
    const location = locations.find(item => item?.code === row.location) || locations.find(item => {
      const children = item?.subLocationList || item?.subLocation
      return Array.isArray(children) && coverage(children.map((child: Json) => child?.code).join(',')).join(',') === codes.join(',')
    })
    const networks: Json[] = Array.isArray(row.locationNetworkList) ? row.locationNetworkList : []
    const names = networks.map(item => item?.locationName).filter((name): name is string => typeof name === 'string' && Boolean(name))
    const id = codes.join(',')
    const name = location?.name || (!region ? names[0] : names.join(', ')) || id
    const group = groups.get(id) || { id, name, countryCode: region ? '' : codes[0], region, plans: [] }
    if (group.plans.some(plan => plan.id === row.packageCode)) continue
    const gb = row.volume / 1073741824
    const data = gb >= 1 ? `${Number(gb.toFixed(2))} GB` : `${Number((row.volume / 1048576).toFixed(2))} MB`
    group.plans.push({
      id: row.packageCode, title: typeof row.name === 'string' ? row.name : data, data,
      days: row.duration, operator: 'Redtea Mobile',
      topUp: [2, 3].includes(Number(row.supportTopUpType)),
      fairUsage: typeof row.fupPolicy === 'string' ? row.fupPolicy : '',
      activation: Number(row.activeType) === 1 ? 'Validity starts when you install the eSIM.'
        : Number(row.activeType) === 2 ? 'Validity starts when the eSIM first connects to a supported network.' : '',
    })
    groups.set(id, group)
  }
  return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name))
}

export function createEsimCatalogProvider({ accessCode, fetchImpl = fetch, now = Date.now }: {
  accessCode: string; fetchImpl?: typeof fetch; now?: () => number
}) {
  let cached: PocketEsimDestination[] | null = null, cacheExpires = 0, retryAfter = 0
  let pending: Promise<PocketEsimDestination[]> | null = null
  async function request(path: string, payload: Json): Promise<Json> {
    const response = await fetchImpl(ORIGIN + path, {
      method: 'POST', redirect: 'error',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'RT-AccessCode': accessCode },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(12_000),
    })
    if (!response.ok) throw new Error('ESIM_PROVIDER_UNAVAILABLE')
    const body = await response.json()
    if (body?.success !== true || !body.obj || typeof body.obj !== 'object') throw new Error('ESIM_PROVIDER_UNAVAILABLE')
    return body.obj
  }
  async function load() {
    const [packages, locations] = await Promise.all([
      request('/package/list', { type: 'BASE', dataType: '1' }), request('/location/list', {}),
    ])
    if (!Array.isArray(packages.packageList) || !Array.isArray(locations.locationList)) throw new Error('ESIM_PROVIDER_UNAVAILABLE')
    cached = normalizeEsimCatalog(packages.packageList, locations.locationList)
    cacheExpires = now() + 60 * 60_000
    return cached
  }
  return {
    configured: Boolean(accessCode),
    async catalog(): Promise<PocketEsimDestination[]> {
      if (!accessCode) throw new Error('ESIM_NOT_CONFIGURED')
      if (cached && now() < cacheExpires) return cached
      if (pending) return pending
      if (now() < retryAfter) throw new Error('ESIM_PROVIDER_UNAVAILABLE')
      pending = load().catch(() => { retryAfter = now() + 60_000; throw new Error('ESIM_PROVIDER_UNAVAILABLE') }).finally(() => { pending = null })
      return pending
    },
  }
}
