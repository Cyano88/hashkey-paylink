import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Push registration crashes natively when Firebase configuration was omitted.
const firebase = JSON.parse(readFileSync(new URL('../android/app/google-services.json', import.meta.url), 'utf8'))
if (!firebase.client?.some(client => client.client_info?.android_client_info?.package_name === 'com.hashpaylink.pocket')) {
  throw new Error('Pocket Android Firebase configuration is missing or belongs to another app.')
}
console.log('Verified Pocket Android push configuration.')

// Native assets cannot rely on the server-injected config used by hosted web.
// Read only the same public configuration endpoint the Pocket client uses.
const response = await fetch('https://pocket.hashpaylink.com/api/public-config', { signal: AbortSignal.timeout(15000) })
if (!response.ok) throw new Error(`Pocket public configuration unavailable: HTTP ${response.status}`)
const config = await response.json()
if (!config.ok || !config.auth?.privyEnabled || !config.auth.privyAppId || !config.auth.authBridge || config.auth.authBridge === 'legacy' || !config.circle?.userWalletAppId) {
  throw new Error('Pocket public authentication configuration is incomplete; native build stopped.')
}
const env = {
  ...process.env,
  VITE_PRIVY_APP_ID: config.auth.privyAppId,
  VITE_AUTH_BRIDGE: config.auth.authBridge,
  VITE_CIRCLE_USER_WALLET_APP_ID: config.circle.userWalletAppId,
  VITE_CIRCLE_EVM_EMAIL_ENABLED: String(config.circle.evmEmailEnabled),
  VITE_POCKET_PUSH_ENABLED: 'true',
  VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET: config.streampay?.checkpointFactoryAddress || '',
}
console.log('Verified production public authentication configuration for Pocket native build.')
if (!process.argv.includes('--check')) {
  const result = spawnSync(process.execPath, ['--max-old-space-size=4096', './node_modules/vite/bin/vite.js', 'build', '--mode', 'pocket-native'], { env, stdio: 'inherit' })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
}
