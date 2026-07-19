const urls = [
  'https://developers.monnify.com/docs/bills-payment',
  'https://developers.monnify.com/docs/bills-payment/process-a-bill',
  'https://developers.monnify.com/api',
]

for (const url of urls) {
  const res = await fetch(url)
  const text = await res.text()
  console.log(`\nURL ${url} ${res.status}`)
  const endpointMatches = [...text.matchAll(/\/(?:api\/v\d+|api|v\d+)[^"'<>\\\s)]{0,180}/g)]
    .map(match => match[0])
  const hits = [...new Set(endpointMatches.filter(value =>
    /bill|util|category|product|service|validate|transaction|customer|biller/i.test(value),
  ))]
  console.log(hits.join('\n') || '(no endpoint-like hits)')
}

const apiBase = 'https://developers.monnify.com'
const apiHtml = await (await fetch(`${apiBase}/api`)).text()
const scripts = [...apiHtml.matchAll(/src="([^"]+\.js)"/g)].map(match => new URL(match[1], apiBase).href)
console.log(`\nAPI page scripts: ${scripts.length}`)
for (const script of scripts) {
  const text = await (await fetch(script)).text()
  if (!/biller|bills|bill-payment|validate-customer|billPayment/i.test(text)) continue
  console.log(`\nSCRIPT HIT ${script}`)
  const endpointMatches = [...text.matchAll(/\/(?:api\/v\d+|api|v\d+)[^"'<>\\\s)]{0,180}/g)]
    .map(match => match[0])
  const hits = [...new Set(endpointMatches.filter(value =>
    /bill|util|category|product|service|validate|transaction|customer|biller/i.test(value),
  ))]
  console.log(hits.join('\n') || '(no endpoint-like hits)')
  for (const term of ['get-biller-categories', 'list-billers', 'get-biller-products', 'validate-customer', 'process-bill-payment', 'check-bill-payment-status', 'biller']) {
    const index = text.toLowerCase().indexOf(term)
    if (index >= 0) {
      console.log(`\nTERM ${term}`)
      console.log(text.slice(Math.max(0, index - 800), index + 1600))
    }
  }
  for (const term of ['openapi', 'swagger', 'redoc', 'bills-payment-apis', 'spec', 'apiReference', 'reference']) {
    const index = text.toLowerCase().indexOf(term.toLowerCase())
    if (index >= 0) {
      console.log(`\nCONFIG TERM ${term}`)
      console.log(text.slice(Math.max(0, index - 700), index + 1400))
      break
    }
  }
}
