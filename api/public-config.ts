import type { Request, Response } from 'express'

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const privyAppId = publicEnv('VITE_PRIVY_APP_ID', 'PRIVY_APP_ID')
  const authBridge = publicEnv('VITE_AUTH_BRIDGE', 'AUTH_BRIDGE') || 'legacy'
  res.json({
    ok: true,
    auth: {
      authBridge,
      privyAppId,
      privyEnabled: Boolean(privyAppId && authBridge !== 'legacy'),
    },
    circle: {
      userWalletAppId: publicEnv('VITE_CIRCLE_USER_WALLET_APP_ID', 'CIRCLE_USER_WALLET_APP_ID'),
      arcTestnetUserWalletAppId: publicEnv(
        'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
        'CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
      ),
      evmEmailEnabled: String(process.env.VITE_CIRCLE_EVM_EMAIL_ENABLED ?? 'true').toLowerCase() !== 'false',
    },
  })
}
