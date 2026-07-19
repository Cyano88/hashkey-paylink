import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local', override: false })
loadEnv({ path: '.env', override: false })

const baseUrl = (process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com').replace(/\/+$/, '')
const apiKey = (process.env.MONNIFY_API_KEY || '').trim()
const secretKey = (process.env.MONNIFY_SECRET_KEY || '').trim()
const contractCode = (process.env.MONNIFY_CONTRACT_CODE || '').trim()

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

function mask(value) {
  if (!value) return 'missing'
  if (value.length <= 8) return 'set'
  return `${value.slice(0, 4)}...${value.slice(-4)}`
}

async function readJson(res) {
  const text = await res.text()
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return { raw: text.slice(0, 300) }
  }
}

async function request(path, token) {
  const res = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  return { res, body: await readJson(res) }
}

async function post(path, token, body = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  })
  return { res, body: await readJson(res) }
}

function summarizeRows(value) {
  const rows = Array.isArray(value)
    ? value
    : Array.isArray(value?.responseBody)
      ? value.responseBody
      : Array.isArray(value?.data)
        ? value.data
        : []
  return rows.slice(0, 8).map((row) => {
    if (!row || typeof row !== 'object') return row
    return Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !/secret|token|key|password/i.test(key))
        .slice(0, 8),
    )
  })
}

async function main() {
  console.log('Monnify Bills sandbox probe')
  console.log(`Base URL: ${baseUrl}`)
  console.log(`API key: ${mask(apiKey)}`)
  console.log(`Secret key: ${mask(secretKey)}`)
  console.log(`Contract code: ${mask(contractCode)}`)

  if (!apiKey || !secretKey || !contractCode) {
    fail('Missing MONNIFY_API_KEY, MONNIFY_SECRET_KEY, or MONNIFY_CONTRACT_CODE in .env.local')
    return
  }

  const auth = Buffer.from(`${apiKey}:${secretKey}`).toString('base64')
  const authRes = await fetch(`${baseUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  })
  const authBody = await readJson(authRes)
  const token = authBody?.responseBody?.accessToken || authBody?.accessToken || authBody?.data?.accessToken
  console.log(`Auth: ${authRes.status} ${authRes.statusText}`)
  if (!authRes.ok || !token) {
    console.log('Auth response:', JSON.stringify(authBody, null, 2))
    fail('Could not authenticate with Monnify sandbox.')
    return
  }

  for (const path of ['/openapi.json', '/swagger.json', '/api-docs', '/api-docs.json', '/v3/api-docs', '/api/openapi.json', '/api/swagger.json']) {
    const result = await request(path, token)
    console.log(`Spec probe ${path}: ${result.res.status}`)
    if (!result.res.ok) continue
    const raw = JSON.stringify(result.body)
    const hits = [...new Set([...raw.matchAll(/\/api\/v\d+[^"'{}\\\s,)]{0,180}/g)].map(match => match[0]).filter(value =>
      /bill|util|category|product|service|validate|transaction|customer|biller/i.test(value),
    ))]
    if (hits.length) {
      console.log('Spec bill endpoints:')
      console.log(hits.join('\n'))
    }
  }

  const categoryPaths = [
    '/api/v1/biller/category',
    '/api/v1/biller/categories',
    '/api/v1/biller/biller-categories',
    '/api/v1/biller/biller-category',
    '/api/v1/biller-categories',
    '/api/v1/biller-category',
    '/api/v1/billpayment/categories',
    '/api/v1/billpayment/biller-categories',
    '/api/v1/billpayments/categories',
    '/api/v1/billpayments/biller-categories',
    '/api/v1/billsPayment/categories',
    '/api/v1/billsPayment/biller-categories',
    '/api/v1/bills-payment/biller-categories',
    '/api/v1/bills-payment/biller-category',
    '/api/v1/bills-payment/category',
    '/api/v1/bills-payment/billers/categories',
    '/api/v1/bill-payments/categories',
    '/api/v1/bill-payments/biller-categories',
    '/api/v1/bill-payments/billers/categories',
    '/api/v2/bills/categories',
    '/api/v2/bills-payment/categories',
    '/api/v2/bills-payment/biller-categories',
    '/api/v2/bill-payment/categories',
    '/api/v2/bill-payment/biller-categories',
    '/api/v1/bill-payment/biller-categories',
    '/api/v1/bill-payment/category',
    '/api/v1/bill-payment/billers/categories',
    '/api/v1/bills/categories',
    '/api/v1/bill-payment/categories',
    '/api/v1/bill-payment/bill-categories',
    '/api/v1/bills-payment/categories',
    '/api/v1/bills-payment/bill-categories',
    '/api/v1/billers/categories',
    '/api/v1/billers/category',
    '/api/v1/billers',
    '/api/v1/biller-categories',
    '/api/v1/bill/categories',
    '/api/v1/bill/biller-categories',
    '/api/v1/bills',
  ]

  let categoryHit = null
  for (const path of categoryPaths) {
    const result = await request(path, token)
    console.log(`Probe ${path}: ${result.res.status}`)
    if (result.res.ok) {
      categoryHit = { path, body: result.body }
      break
    }
  }

  if (!categoryHit) {
    fail('Authenticated, but no known Bills category endpoint responded OK. Check Monnify sandbox docs/dashboard endpoint path.')
    return
  }

  console.log(`Bills category endpoint: ${categoryHit.path}`)
  console.log('Sample categories:')
  console.log(JSON.stringify(summarizeRows(categoryHit.body), null, 2))

  const sampleCategories = summarizeRows(categoryHit.body)
  const firstCategory = sampleCategories[0]
  const categoryCode = firstCategory?.categoryCode
    || firstCategory?.code
    || firstCategory?.id
    || firstCategory?.name
    || firstCategory?.category
    || 'AIRTIME'

  const billerPaths = [
    `/api/v1/bill-payment/billers?categoryCode=${encodeURIComponent(categoryCode)}`,
    `/api/v1/bill-payment/billers?category=${encodeURIComponent(categoryCode)}`,
    `/api/v1/bill-payment/billers/${encodeURIComponent(categoryCode)}`,
    `/api/v1/bills-payment/billers?categoryCode=${encodeURIComponent(categoryCode)}`,
    `/api/v1/billers?categoryCode=${encodeURIComponent(categoryCode)}`,
    `/api/v1/billers?category=${encodeURIComponent(categoryCode)}`,
    `/api/v1/bill-payment/biller-list?categoryCode=${encodeURIComponent(categoryCode)}`,
  ]

  for (const path of billerPaths) {
    const result = await request(path, token)
    console.log(`Probe billers ${path}: ${result.res.status}`)
    if (result.res.ok) {
      console.log(`Biller endpoint: ${path}`)
      console.log(JSON.stringify(summarizeRows(result.body), null, 2))
      break
    }
  }

  const postBillerPaths = [
    '/api/v1/bill-payment/billers',
    '/api/v1/bills-payment/billers',
    '/api/v1/billers',
  ]
  for (const path of postBillerPaths) {
    const result = await post(path, token, { categoryCode })
    console.log(`Probe POST billers ${path}: ${result.res.status}`)
    if (result.res.ok) {
      console.log(`POST biller endpoint: ${path}`)
      console.log(JSON.stringify(summarizeRows(result.body), null, 2))
      break
    }
  }
}

main().catch((err) => {
  fail(err instanceof Error ? err.message : String(err))
})
