type RuntimePublicConfig = {
  auth?: {
    authBridge?: string
    privyAppId?: string
  }
  streampay?: {
    checkpointFactoryAddress?: string
  }
}

declare global {
  interface Window {
    __HASH_PAYLINK_CONFIG__?: RuntimePublicConfig
  }
}

const runtimeConfig = typeof window !== 'undefined' ? window.__HASH_PAYLINK_CONFIG__ : undefined
const buildEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env

export const AUTH_BRIDGE_MODE = runtimeConfig?.auth?.authBridge ?? buildEnv?.VITE_AUTH_BRIDGE ?? 'legacy'
export const PRIVY_APP_ID = runtimeConfig?.auth?.privyAppId ?? buildEnv?.VITE_PRIVY_APP_ID
export const PRIVY_AUTH_ENABLED = !!PRIVY_APP_ID && AUTH_BRIDGE_MODE !== 'legacy'
export const CHECKPOINT_FACTORY_ADDRESS_MAINNET = (
  runtimeConfig?.streampay?.checkpointFactoryAddress
    ?? buildEnv?.VITE_CHECKPOINT_FACTORY_ADDRESS_MAINNET
    ?? ''
) as `0x${string}`
