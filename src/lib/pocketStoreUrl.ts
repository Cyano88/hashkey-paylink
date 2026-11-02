// Accept only Pocket's official listing or its Play testing opt-in page.
export function pocketStoreUrl(value: unknown): string {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    if (url.origin !== 'https://play.google.com' || url.username || url.password) return ''
    if ((url.pathname === '/store/apps/details' && url.searchParams.get('id') === 'com.hashpaylink.pocket') || url.pathname === '/apps/testing/com.hashpaylink.pocket') return url.href
  } catch {}
  return ''
}
