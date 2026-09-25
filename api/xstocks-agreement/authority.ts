// Hosted Agreements use Hash PayLink's own Privy app. Never accept an app ID
// or credential from a request, and never silently substitute another wallet.
export function agreementPrivyAuthority(env: NodeJS.ProcessEnv) {
  const appId = env.PRIVY_APP_ID || env.VITE_PRIVY_APP_ID
  const appSecret = env.PRIVY_APP_SECRET
  if (typeof appId !== 'string' || !/^[a-zA-Z0-9_-]{8,150}$/.test(appId)
    || typeof appSecret !== 'string' || !appSecret.trim()) {
    throw Object.assign(Error('Agreement wallet configuration is unavailable.'), {status:503})
  }
  return { appId, env: {...env, PRIVY_APP_ID:appId, VITE_PRIVY_APP_ID:appId, PRIVY_APP_SECRET:appSecret} }
}
