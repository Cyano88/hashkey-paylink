export function checkoutHandoff(id: string, attempt = '', cash = false) {
  if (!/^(chk_[A-Za-z0-9]{8,40}|chk[bxs]_[a-f0-9]{24})$/.test(id) || (attempt && !/^[A-Za-z0-9_-]{1,80}$/.test(attempt))) throw Error('Invalid checkout reference.')
  const query = new URLSearchParams(attempt ? {attempt} : {})
  if(cash)query.set('method','cash_balance')
  const path = '/pay/c/' + id + (query.size ? '?' + query : '')
  const nativePath = '/open/checkout/' + id + (query.size ? '?' + query : '')
  const url = 'https://app.hashpaylink.com' + nativePath
  const fallback = new URL('https://app.hashpaylink.com' + path); fallback.searchParams.set('pocketFallback', '1')
  return {url, fallback: fallback.pathname + fallback.search, browser: path + (query.size ? '&' : '?') + 'browser=1', android: 'intent://app.hashpaylink.com' + nativePath + '#Intent;scheme=https;package=com.hashpaylink.pocket;S.browser_fallback_url=' + encodeURIComponent(fallback.href) + ';end'}
}
