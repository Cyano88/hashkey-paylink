type RuntimePublicConfig = {
  auth?: {
    authBridge?: string
    privyAppId?: string
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
