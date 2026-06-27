import { config as loadEnv } from 'dotenv'
import crypto from 'node:crypto'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const execute = process.argv.includes('--execute') || process.env.BILLER_PROBE_EXECUTE === 'true'
const country = getArg('--country') || process.env.BILLER_PROBE_COUNTRY || 'NG'
const category = getArg('--category') || process.env.BILLER_PROBE_CATEGORY || 'electricity'
const customer = getArg('--customer') || process.env.BILLER_PROBE_CUSTOMER || ''
const amount = Number(getArg('--amount') || process.env.BILLER_PROBE_AMOUNT || '100')
const providerFilter = (getArg('--provider') || process.env.BILLER_PROBE_PROVIDER || 'all').toLowerCase()

const timeoutMs = Number(process.env.BILLER_PROBE_TIMEOUT_MS || '20000')

function getArg(name) {
  const index = process.argv.indexOf(name)
  if (index === -1) return ''
  return process.argv[index + 1] || ''
}

function mask(value) {
  if (!value) return 'missing'
  if (value.length <= 10) return 'set'
  return `${value.slice(0, 5)}...${value.slice(-4)}`
}

function safeJson(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"?(access_token|token|secret|api[_-]?key|password)"?\s*:\s*"[^"]*"/gi, '"$1": "[redacted]"')
    .slice(0, 4000)
}

async function readBody(res) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text.slice(0, 1000) }
  }
}

async function request(url, options = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    let res
    const fetchOptions = {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        res = await fetch(url, fetchOptions)
        break
      } catch (error) {
        if (attempt === 0) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          continue
        }
        const message = error instanceof Error ? error.message : String(error)
        const cause = error instanceof Error && error.cause instanceof Error ? `: ${error.cause.message}` : ''
        return { ok: false, status: 0, statusText: `NETWORK_ERROR ${message}${cause}`, body: null }
      }
    }
    if (!res) {
      return { ok: false, status: 0, statusText: 'NETWORK_ERROR request did not return a response', body: null }
    }
    return { ok: res.ok, status: res.status, statusText: res.statusText, body: await readBody(res) }
  } finally {
    clearTimeout(timer)
  }
}

function summarizeRows(value) {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.data)
      ? value.data
      : Array.isArray(value?.content)
        ? value.content
        : Array.isArray(value?.responseBody)
          ? value.responseBody
          : []

  return rows.slice(0, 5).map((row) => {
    if (!row || typeof row !== 'object') return row
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !/token|secret|password|key/i.test(key))
        .slice(0, 12),
    )
  })
}

function pickFirstId(value) {
  const rows = summarizeRows(value)
  const first = rows[0]
  if (!first || typeof first !== 'object') return ''
  return String(first.id || first.operatorId || first.billerId || first.code || first.serviceID || first.productId || '')
}

function countryAlpha3(value) {
  const code = String(value || '').trim().toUpperCase()
  const map = {
    NG: 'NGA',
    NGA: 'NGA',
    GH: 'GHA',
    GHA: 'GHA',
    KE: 'KEN',
    KEN: 'KEN',
    UG: 'UGA',
    UGA: 'UGA',
  }
  return map[code] || code
}

function normalizeE164(value, countryCode) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '')

  const digits = raw.replace(/\D/g, '')
  const alpha3 = countryAlpha3(countryCode)
  if (alpha3 === 'NGA') {
    if (digits.startsWith('0')) return `+234${digits.slice(1)}`
    if (digits.startsWith('234')) return `+${digits}`
  }
  if (alpha3 === 'GHA') {
    if (digits.startsWith('0')) return `+233${digits.slice(1)}`
    if (digits.startsWith('233')) return `+${digits}`
  }
  if (digits.startsWith('1') || digits.startsWith('2') || digits.startsWith('3') || digits.startsWith('4') || digits.startsWith('5') || digits.startsWith('6') || digits.startsWith('7') || digits.startsWith('8') || digits.startsWith('9')) {
    return `+${digits}`
  }
  return digits
}

function basicAuth(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

class ProbeResult {
  constructor(name) {
    this.name = name
    this.steps = []
  }

  add(step, status, detail) {
    this.steps.push({ step, status, detail })
  }

  print() {
    console.log(`\n=== ${this.name} ===`)
    for (const item of this.steps) {
      console.log(`${item.status.padEnd(8)} ${item.step}`)
      if (item.detail !== undefined) {
        console.log(typeof item.detail === 'string' ? item.detail : safeJson(item.detail))
      }
    }
  }
}

class DtOneProbe {
  constructor() {
    this.name = 'DT One DVS'
    this.baseUrl = (process.env.DTONE_BASE_URL || 'https://preprod-dvs-api.dtone.com/v1').replace(/\/+$/, '')
    this.apiKey = (process.env.DTONE_API_KEY || '').trim()
    this.apiSecret = (process.env.DTONE_API_SECRET || '').trim()
    this.productId = (process.env.DTONE_PRODUCT_ID || '').trim()
    this.callbackUrl = (process.env.DTONE_CALLBACK_URL || '').trim()
  }

  matches(filter) {
    return ['dtone', 'dt-one', 'dt one', 'dt'].includes(filter) || this.name.toLowerCase().includes(filter)
  }

  configured() {
    return Boolean(this.apiKey && this.apiSecret)
  }

  headers() {
    return { Authorization: basicAuth(this.apiKey, this.apiSecret) }
  }

  async run() {
    const result = new ProbeResult(this.name)
    const alpha3 = countryAlpha3(country)
    const e164 = normalizeE164(customer, alpha3)

    if (!this.configured()) {
      result.add('credentials', 'SKIP', 'Missing DTONE_API_KEY or DTONE_API_SECRET. Generate pre-production API keys in DT Shop, then retry.')
      result.add('base URL', 'INFO', this.baseUrl)
      return result
    }

    const headers = this.headers()
    result.add('credentials', 'PASS', { baseUrl: this.baseUrl, apiKey: mask(this.apiKey), country: alpha3 })

    const discoveryPaths = [
      `/countries/${encodeURIComponent(alpha3)}`,
      `/operators?country_iso_code=${encodeURIComponent(alpha3)}&per_page=10`,
      `/products?country_iso_code=${encodeURIComponent(alpha3)}&per_page=10`,
      `/products?service_id=1&country_iso_code=${encodeURIComponent(alpha3)}&per_page=10`,
      '/services?per_page=100',
    ]

    let catalog = null
    let catalogPath = ''
    for (const path of discoveryPaths) {
      const response = await request(`${this.baseUrl}${path}`, { headers })
      result.add(`catalog ${path}`, response.ok ? 'PASS' : 'MISS', {
        status: response.status,
        sample: response.ok ? summarizeRows(response.body) : response.body,
      })
      if (response.ok && !catalog && /\/products/.test(path)) {
        catalog = response.body
        catalogPath = path
      }
    }

    if (customer) {
      const lookupPath = `/lookup/mobile-number/${encodeURIComponent(e164)}?per_page=10`
      const response = await request(`${this.baseUrl}${lookupPath}`, { headers })
      result.add(`lookup mobile ${lookupPath}`, response.ok ? 'PASS' : 'MISS', {
        status: response.status,
        normalizedCustomer: mask(e164),
        sample: response.ok ? summarizeRows(response.body) : response.body,
      })
    } else {
      result.add('lookup mobile', 'SKIP', 'Set BILLER_PROBE_CUSTOMER or --customer with an E.164 phone number to test operator lookup.')
    }

    const selectedProductId = this.productId || pickFirstId(catalog)
    if (!selectedProductId) {
      result.add('select product', 'FAIL', 'No product id found. Set DTONE_PRODUCT_ID after checking /products catalog access.')
      return result
    }
    result.add('select product', 'PASS', { catalogPath, productId: selectedProductId })

    const productResponse = await request(`${this.baseUrl}/products/${encodeURIComponent(selectedProductId)}`, { headers })
    result.add(`product /products/${selectedProductId}`, productResponse.ok ? 'PASS' : 'MISS', {
      status: productResponse.status,
      sample: productResponse.ok ? summarizeRows([productResponse.body]) : productResponse.body,
    })

    result.add('quote', 'INFO', {
      amount,
      country: alpha3,
      normalizedCustomer: e164 ? mask(e164) : 'not set',
      note: 'Use DT One product pricing and required_*_identifier_fields to choose fixed/ranged value UI and transaction payload.',
    })

    if (!execute) {
      result.add('pay', 'SKIP', 'Dry run. Pass --execute only after DT One sandbox credentials, DTONE_PRODUCT_ID, and wallet funding are confirmed.')
      result.add('receipt', 'SKIP', 'Payment was not executed.')
      return result
    }

    if (!e164) {
      result.add('pay', 'FAIL', 'DT One mobile topup execution requires --customer in E.164 format or a country-local number that can be normalized.')
      return result
    }

    const externalId = `hpl-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`.slice(0, 40)
    const transactionPayload = {
      external_id: externalId,
      product_id: Number(selectedProductId),
      auto_confirm: true,
      credit_party_identifier: { mobile_number: e164 },
    }
    if (this.callbackUrl) transactionPayload.callback_url = this.callbackUrl
    if (/ranged/i.test(String(productResponse.body?.type || ''))) {
      transactionPayload.calculation_mode = 'SOURCE_AMOUNT'
      transactionPayload.source = { unit_type: 'CURRENCY', unit: 'USD', amount }
    }

    const response = await request(`${this.baseUrl}/transactions/async`, {
      method: 'POST',
      headers,
      body: JSON.stringify(transactionPayload),
    })
    result.add('pay /transactions/async', response.ok ? 'PASS' : 'FAIL', { status: response.status, body: response.body })
    if (response.ok) result.add('receipt', 'PASS', response.body)

    return result
  }
}

class ReloadlyProbe {
  constructor() {
    this.name = 'Reloadly Utility Payments'
    this.clientId = (process.env.RELOADLY_CLIENT_ID || '').trim()
    this.clientSecret = (process.env.RELOADLY_CLIENT_SECRET || '').trim()
    this.authUrl = (process.env.RELOADLY_AUTH_URL || 'https://auth.reloadly.com/oauth/token').replace(/\/+$/, '')
    this.product = /airtime|topup|data/i.test(category) ? 'topups' : 'utilities'
    this.baseUrl = (
      this.product === 'topups'
        ? process.env.RELOADLY_AIRTIME_BASE_URL || 'https://topups-sandbox.reloadly.com'
        : process.env.RELOADLY_UTILITY_BASE_URL || 'https://utilities-sandbox.reloadly.com'
    ).replace(/\/+$/, '')
    this.audience = (
      this.product === 'topups'
        ? process.env.RELOADLY_AIRTIME_AUDIENCE || 'https://topups.reloadly.com'
        : process.env.RELOADLY_UTILITY_AUDIENCE || this.baseUrl
    ).replace(/\/+$/, '')
    this.token = ''
  }

  matches(filter) {
    return this.name.toLowerCase().includes(filter)
  }

  configured() {
    return Boolean(this.clientId && this.clientSecret)
  }

  async auth(result) {
    if (!this.configured()) {
      result.add('credentials', 'SKIP', `Missing RELOADLY_CLIENT_ID or RELOADLY_CLIENT_SECRET. Product: ${this.product}. Base URL: ${this.baseUrl}`)
      return false
    }

    const auth = await request(this.authUrl, {
      method: 'POST',
      body: JSON.stringify({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        audience: this.audience,
      }),
    })
    result.add('authenticate', auth.ok ? 'PASS' : 'FAIL', {
      status: auth.status,
      statusText: auth.statusText,
      clientId: mask(this.clientId),
      product: this.product,
      audience: this.audience,
      body: auth.ok ? { token: 'received' } : auth.body,
    })
    this.token = auth.body?.access_token || ''
    return auth.ok && Boolean(this.token)
  }

  async run() {
    const result = new ProbeResult(this.name)
    if (!(await this.auth(result))) return result

    const headers = { Authorization: `Bearer ${this.token}` }
    const discoveryPaths = this.product === 'topups'
      ? [
          `/operators/countries/${encodeURIComponent(country)}`,
          `/operators/countries/${encodeURIComponent(country)}?includeBundles=true&includeData=true&includePin=true`,
          `/operators/auto-detect/countries/${encodeURIComponent(country)}`,
        ]
      : [
          `/operators/countries/${encodeURIComponent(country)}`,
          `/operators?countryCode=${encodeURIComponent(country)}`,
          `/services?countryCode=${encodeURIComponent(country)}`,
          `/billers?countryCode=${encodeURIComponent(country)}`,
          `/products/countries/${encodeURIComponent(country)}`,
        ]

    let catalog = null
    let catalogPath = ''
    for (const path of discoveryPaths) {
      const response = await request(`${this.baseUrl}${path}`, { headers })
      result.add(`catalog ${path}`, response.ok ? 'PASS' : 'MISS', {
        status: response.status,
        sample: response.ok ? summarizeRows(response.body) : response.body,
      })
      if (response.ok && !catalog) {
        catalog = response.body
        catalogPath = path
      }
    }

    const operatorId = process.env.RELOADLY_OPERATOR_ID || pickFirstId(catalog)
    if (!operatorId) {
      result.add('select operator', 'FAIL', 'No operator/biller id found. Set RELOADLY_OPERATOR_ID after checking the catalog response.')
      return result
    }
    result.add('select operator', 'PASS', { catalogPath, operatorId })

    if (customer) {
      if (this.product === 'topups') {
        const normalizedPhone = String(customer).replace(/^\+/, '')
        const detectPath = `/operators/auto-detect/phone/${encodeURIComponent(normalizedPhone)}/countries/${encodeURIComponent(country)}`
        const response = await request(`${this.baseUrl}${detectPath}`, { headers })
        result.add(`validate ${detectPath}`, response.ok ? 'PASS' : 'MISS', { status: response.status, body: response.body })
      } else {
        const validatePayload = {
          operatorId,
          accountNumber: customer,
          customerId: customer,
          countryCode: country,
        }
        const validatePaths = ['/accounts/validate', '/account/validate', '/customers/validate']
        for (const path of validatePaths) {
          const response = await request(`${this.baseUrl}${path}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(validatePayload),
          })
          result.add(`validate ${path}`, response.ok ? 'PASS' : 'MISS', { status: response.status, body: response.body })
          if (response.ok) break
        }
      }
    } else {
      result.add('validate customer/meter', 'SKIP', this.product === 'topups'
        ? 'Set BILLER_PROBE_CUSTOMER or --customer to test phone/operator auto-detect.'
        : 'Set BILLER_PROBE_CUSTOMER or --customer to test validation.')
    }

    result.add('quote', 'INFO', {
      amount,
      note: this.product === 'topups'
        ? 'Reloadly airtime uses operator fixedAmounts/suggestedAmounts/min/max metadata from the catalog.'
        : 'Reloadly utility products often return fixed/variable product metadata from catalog. Use provider response to derive the final quote.',
    })

    if (!execute) {
      result.add('pay', 'SKIP', 'Dry run. Pass --execute and provider credentials only when ready to vend.')
      result.add('receipt', 'SKIP', 'Payment was not executed.')
      return result
    }

    const customIdentifier = `hashpaylink-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const orderPayload = this.product === 'topups'
      ? {
          operatorId,
          amount,
          customIdentifier,
          recipientPhone: { countryCode: country, number: String(customer).replace(/^\+/, '') },
        }
      : {
          operatorId,
          amount,
          customIdentifier,
          recipientAccountNumber: customer,
          accountNumber: customer,
          countryCode: country,
        }
    const orderPaths = this.product === 'topups' ? ['/topups'] : ['/orders', '/payments', '/transactions']
    for (const path of orderPaths) {
      const response = await request(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(orderPayload),
      })
      result.add(`pay ${path}`, response.ok ? 'PASS' : 'MISS', { status: response.status, body: response.body })
      if (response.ok) {
        result.add('receipt', 'PASS', response.body)
        break
      }
    }

    return result
  }
}

class BaxiProbe {
  constructor() {
    this.name = 'Baxi Bills'
    this.baseUrl = (process.env.BAXI_BASE_URL || '').replace(/\/+$/, '')
    this.apiKey = (process.env.BAXI_API_KEY || process.env.BAXI_SECRET_KEY || '').trim()
  }

  matches(filter) {
    return this.name.toLowerCase().includes(filter)
  }

  configured() {
    return Boolean(this.baseUrl && this.apiKey)
  }

  async run() {
    const result = new ProbeResult(this.name)
    if (!this.configured()) {
      result.add('credentials', 'SKIP', 'Missing BAXI_BASE_URL and BAXI_API_KEY. Set the exact base URL from Baxi after onboarding.')
      return result
    }

    const authHeader = process.env.BAXI_AUTH_HEADER || 'x-api-key'
    const headers = { [authHeader]: this.apiKey }
    result.add('credentials', 'PASS', { baseUrl: this.baseUrl, authHeader, apiKey: mask(this.apiKey) })

    const categoryPaths = [
      '/services',
      '/billers',
      '/bills/services',
      '/billers/services',
      '/api/services',
      '/api/billers',
    ]

    let catalog = null
    let catalogPath = ''
    for (const path of categoryPaths) {
      const response = await request(`${this.baseUrl}${path}`, { headers })
      result.add(`catalog ${path}`, response.ok ? 'PASS' : 'MISS', {
        status: response.status,
        sample: response.ok ? summarizeRows(response.body) : response.body,
      })
      if (response.ok && !catalog) {
        catalog = response.body
        catalogPath = path
      }
    }

    const serviceId = process.env.BAXI_SERVICE_ID || pickFirstId(catalog)
    if (!serviceId) {
      result.add('select service', 'FAIL', 'No service id found. Set BAXI_SERVICE_ID after checking the catalog response.')
      return result
    }
    result.add('select service', 'PASS', { catalogPath, serviceId, category })

    if (customer) {
      const validatePayload = {
        serviceId,
        service_id: serviceId,
        accountNumber: customer,
        account_number: customer,
        meterNumber: customer,
        smartcardNumber: customer,
      }
      const validatePaths = ['/validate', '/bills/validate', '/services/validate', '/api/validate']
      for (const path of validatePaths) {
        const response = await request(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers,
          body: JSON.stringify(validatePayload),
        })
        result.add(`validate ${path}`, response.ok ? 'PASS' : 'MISS', { status: response.status, body: response.body })
        if (response.ok) break
      }
    } else {
      result.add('validate customer/meter', 'SKIP', 'Set BILLER_PROBE_CUSTOMER or --customer to test validation.')
    }

    result.add('quote', 'INFO', {
      amount,
      note: 'Use service metadata plus validation response to decide whether amount is fixed, ranged, or open.',
    })

    if (!execute) {
      result.add('pay', 'SKIP', 'Dry run. Pass --execute and provider credentials only when ready to vend.')
      result.add('receipt', 'SKIP', 'Payment was not executed.')
      return result
    }

    const reference = `hashpaylink-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`
    const paymentPayload = {
      serviceId,
      service_id: serviceId,
      amount,
      reference,
      customer,
      accountNumber: customer,
      account_number: customer,
    }
    const payPaths = ['/pay', '/bills/pay', '/vend', '/api/pay']
    for (const path of payPaths) {
      const response = await request(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(paymentPayload),
      })
      result.add(`pay ${path}`, response.ok ? 'PASS' : 'MISS', { status: response.status, body: response.body })
      if (response.ok) {
        result.add('receipt', 'PASS', response.body)
        break
      }
    }

    return result
  }
}

async function main() {
  console.log('Hash PayLink biller provider probe')
  console.log(`Mode: ${execute ? 'EXECUTE REAL PAYMENT' : 'dry-run discovery/validation only'}`)
  console.log(`Country: ${country}`)
  console.log(`Category: ${category}`)
  console.log(`Customer/meter: ${customer ? mask(customer) : 'not set'}`)
  console.log(`Amount: ${Number.isFinite(amount) ? amount : 'invalid'}`)

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Amount must be a positive number.')
  }

  const providers = [
    new DtOneProbe(),
    new ReloadlyProbe(),
    new BaxiProbe(),
  ].filter((provider) => providerFilter === 'all' || provider.matches(providerFilter))

  if (providers.length === 0) {
    throw new Error(`No provider matched "${providerFilter}". Use all, dtone, reloadly, or baxi.`)
  }

  for (const provider of providers) {
    const result = await provider.run()
    result.print()
  }

  console.log('\nDecision rule:')
  console.log('- Pick the provider that passes catalog + validation first, has the exact biller coverage we need, and returns a stable receipt/status reference.')
  console.log('- Keep --execute off until credentials, wallet funding, and provider production terms are confirmed.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
