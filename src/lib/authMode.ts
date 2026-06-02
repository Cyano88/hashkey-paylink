export const AUTH_BRIDGE_MODE = import.meta.env.VITE_AUTH_BRIDGE ?? 'legacy'
export const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID as string | undefined
export const PRIVY_AUTH_ENABLED = !!PRIVY_APP_ID && AUTH_BRIDGE_MODE !== 'legacy'
