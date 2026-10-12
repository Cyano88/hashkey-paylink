import type { PocketEsimDestination } from '../../src/pocket/lib/pocketEsim.js'
import { priceEsim, type EsimPricePolicy } from './esim-pricing.js'

const ORIGIN = 'https://api.esimaccess.com/api/v1/open'
type Json = Record<string, any>
const coverage = (value: unknown) => typeof value === 'string' ? [...new Set(value.split(',').map(code => code.trim()).filter(Boolean))].sort() : []

export function normalizeEsimCatalog(rows: Json[], locations: Json[] = []): PocketEsimDestination[] {
  const groups = new Map<string, PocketEsimDestination>()
  for (const row of rows) {
    if (!row || typeof row.packageCode !== 'string' || !row.packageCode || ![1,2].includes(Number(row.dataType)) || row.durationUnit !== 'DAY'
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
    const rawName = location?.name || (!region ? names[0] : names.join(', ')) || codes.join(',')
    // Provider inventory has several country bundles per region. Group only
    // numeric coverage suffixes; keep distinct combinations such as Europe & Morocco.
    const name = region ? String(rawName).replace(/\s*\(\d+\+?\s*(?:areas?|countries)\)/gi, '').trim() : rawName
    const id = region ? 'region:'+name.toLowerCase() : codes[0]
    const group = groups.get(id) || { id, name, countryCode: region ? '' : codes[0], region, plans: [] }
    if (group.plans.some(plan => plan.id === row.packageCode)) continue
    const gb = row.volume / 1073741824
    const data = gb >= 1 ? `${Number(gb.toFixed(2))} GB` : `${Number((row.volume / 1048576).toFixed(2))} MB`
    group.plans.push({
      id: row.packageCode, title: typeof row.name === 'string' ? row.name : data, data: Number(row.dataType) === 2 ? `${data} / day` : data,
      daily: Number(row.dataType) === 2,
      ...(region ? { coverage: codes.map(code => {
        const listed=locations.find(item=>item?.code===code && typeof item.name==='string')?.name
        if(listed)return listed
        try{return new Intl.DisplayNames(['en'],{type:'region'}).of(code)||code}catch{return code}
      }) } : {}),
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
  let inventory: Json[] = []
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
    const [packages, daily, locations] = await Promise.all([
      request('/package/list', { type: 'BASE', dataType: '1' }), request('/package/list', { type: 'BASE', dataType: '2' }), request('/location/list', {}),
    ])
    if (!Array.isArray(packages.packageList) || !Array.isArray(daily.packageList) || !Array.isArray(locations.locationList)) throw new Error('ESIM_PROVIDER_UNAVAILABLE')
    inventory = [...packages.packageList, ...daily.packageList]
    cached = normalizeEsimCatalog(inventory, locations.locationList)
    cacheExpires = now() + 60 * 60_000
    return cached
  }
  return {
    configured: Boolean(accessCode),
    async price(packageCode: string, days: number, policy?: EsimPricePolicy) {
      await this.catalog()
      const row = inventory.find(item => item.packageCode === packageCode)
      if (!row || !cached?.some(destination => destination.plans.some(plan => plan.id === packageCode))) throw Error('ESIM_PLAN_UNAVAILABLE')
      return { ...priceEsim(row, days, policy), packageCode, slug: typeof row.slug === 'string' ? row.slug : '', daily: Number(row.dataType) === 2 }
    },
    async balance() {
      const value = await request('/balance/query', {})
      if (!Number.isSafeInteger(value.balance) || value.balance < 0) throw Error('ESIM_PROVIDER_UNAVAILABLE')
      return value.balance as number
    },
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
