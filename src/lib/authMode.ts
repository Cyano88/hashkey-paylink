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

export const AUTH_BRIDGE_MODE = runtimeConfig?.auth?.authBridge ?? import.meta.env.VITE_AUTH_BRIDGE ?? 'legacy'
export const PRIVY_APP_ID = runtimeConfig?.auth?.privyAppId ?? import.meta.env.VITE_PRIVY_APP_ID as string | undefined
export const PRIVY_AUTH_ENABLED = !!PRIVY_APP_ID && AUTH_BRIDGE_MODE !== 'legacy'
export const CHECKPOINT_FACTORY_ADDRESS = (
  runtimeConfig?.streampay?.checkpointFactoryAddress
    ?? import.meta.env.VITE_CHECKPOINT_FACTORY_ADDRESS
    ?? '0x8eEc65a18f3b5deb0E9Fc5e1eCf8263587b02927'
) as `0x${string}`
