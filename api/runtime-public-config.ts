type PublicEnvironment = Record<string, string | undefined>

export function readMainnetCheckpointFactory(env: PublicEnvironment = process.env) {
  const address = (env.CHECKPOINT_FACTORY_ADDRESS_MAINNET ?? env.VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET ?? '').trim()
  return /^0x[a-fA-F0-9]{40}$/.test(address) && !/^0x0{40}$/i.test(address) ? address : ''
}

export function runtimePublicConfig(env: PublicEnvironment = process.env) {
  const first = (...names: string[]) => names.map(name => env[name]?.trim()).find(Boolean) || ''
  const privyAppId = first('VITE_PRIVY_APP_ID', 'PRIVY_APP_ID')
  const authBridge = first('VITE_AUTH_BRIDGE', 'AUTH_BRIDGE') || 'legacy'
  return {
    auth: { authBridge, privyAppId, privyEnabled: Boolean(privyAppId && authBridge !== 'legacy') },
    streampay: { checkpointFactoryAddress: readMainnetCheckpointFactory(env) },
  }
}

export function runtimePublicConfigScript(env: PublicEnvironment = process.env) {
  const payload = JSON.stringify(runtimePublicConfig(env)).replace(/</g, '\\u003c')
  return `<script>window.__HASH_PAYLINK_CONFIG__=${payload};</script>`
}
