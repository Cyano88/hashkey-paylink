export type AppSurface = 'pocket' | 'checkout' | 'developer' | 'docs' | 'website'

// Native Pocket uses app.hashpaylink.com as its WebView hostname.
// Its runtime identity must take precedence over all web host routing.
export function resolveAppSurface(hostname: string, pocketRuntime: boolean): AppSurface {
  if (pocketRuntime || hostname === 'pocket.hashpaylink.com') return 'pocket'
  if (hostname === 'app.hashpaylink.com') return 'checkout'
  if (hostname === 'developer.hashpaylink.com') return 'developer'
  if (hostname === 'docs.hashpaylink.com') return 'docs'
  return 'website'
}
