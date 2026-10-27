export function checkoutHandoff(id: string, attempt = '') {
  if (!/^(chk_[A-Za-z0-9]{8,40}|chk[bx]_[a-f0-9]{24})$/.test(id) || (attempt && !/^[A-Za-z0-9_-]{1,80}$/.test(attempt))) throw Error('Invalid checkout reference.')
  const query = new URLSearchParams(attempt ? {attempt} : {})
  const path = '/pay/c/' + id + (query.size ? '?' + query : '')
  const url = 'https://app.hashpaylink.com' + path
  const fallback = new URL(url); fallback.searchParams.set('browser', '1')
  return {url, browser: path + (query.size ? '&' : '?') + 'browser=1', android: 'intent://app.hashpaylink.com' + path + '#Intent;scheme=https;package=com.hashpaylink.pocket;S.browser_fallback_url=' + encodeURIComponent(fallback.href) + ';end'}
}
