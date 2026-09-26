// A navigation hint only. Payment success is always read from the server/chain.
// Keep this first-party route narrow until project-configured returns are supported.
export function tradeReturnUrl(value: string | null): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    if (url.origin !== 'https://hashpaystream.app' || url.username || url.password || url.pathname !== '/trade' || url.hash) return;
    if (url.searchParams.get('view') !== 'enquiries' || url.searchParams.getAll('view').length !== 1 || url.searchParams.getAll('conversation').length !== 1) return;
    const conversation = url.searchParams.get('conversation') || '';
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(conversation)) return;
    if ([...url.searchParams.keys()].some(key => !['view','conversation'].includes(key))) return;
    return 'https://hashpaystream.app/trade?view=enquiries&conversation=' + encodeURIComponent(conversation);
  } catch { return; }
}
