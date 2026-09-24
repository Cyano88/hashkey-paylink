export type PocketScanCode = { kind: 'xpay'; id: string; url: string } | { kind: 'pos'; id: string; url: string } | { kind: 'checkout'; id: string; attempt: string; url: string }
const hosts = new Set(['app.hashpaylink.com', 'hashpaylink.com', 'pocket.hashpaylink.com'])
export function parsePocketScanCode(raw: string): PocketScanCode {
  if (typeof raw !== 'string' || raw.length > 4096) throw Error('This QR is not a supported Hash PayLink checkout.')
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw Error('Scan a Hash PayLink merchant or checkout QR.') }
  if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port || url.hash) throw Error('This QR is not a supported Hash PayLink checkout.')
  const keys = [...url.searchParams.keys()]
  if (new Set(keys).size !== keys.length) throw Error('This checkout link has conflicting details.')
  const xpay = /^\/xpay\/([0-9a-f-]{36})\/?$/.exec(url.pathname)
  if (xpay && !keys.length) return {kind:'xpay',id:xpay[1],url:url.href}
  const checkout = /^\/pay\/c\/(chk_[A-Za-z0-9]{8,40})\/?$/.exec(url.pathname)
  const hosted = checkout?.[1] || (url.pathname === '/pay' ? url.searchParams.get('checkout') || url.searchParams.get('checkoutId') || '' : '')
  if (hosted && /^chk_[A-Za-z0-9]{8,40}$/.test(hosted)) {
    const attempt=url.searchParams.get('attempt')||''
    if (attempt && !/^[A-Za-z0-9_-]{1,80}$/.test(attempt)) throw Error('Invalid checkout attempt.')
    return {kind:'checkout',id:hosted,attempt,url:url.href}
  }
  const id = url.pathname === '/pos/ng' ? url.searchParams.get('merchant_id') : url.pathname === '/pay' && url.searchParams.get('src') === 'ngpos' ? url.searchParams.get('merchant') : ''
  if (!id || !/^[A-Za-z0-9_-]{1,100}$/.test(id)) throw Error('Scan a supported Hash PayLink merchant or checkout QR.')
  return {kind:'pos',id,url:url.href}
}
export function pocketScanDestination(raw: string) {
  try { const code=parsePocketScanCode(raw);return code.kind==='xpay' ? '/xstocks/xpay?merchant='+encodeURIComponent(code.id) : '/home/scan?code='+encodeURIComponent(code.url) } catch { return '' }
}
