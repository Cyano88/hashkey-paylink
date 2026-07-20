import type { Request, Response } from 'express'
import { publicVtpassPhase0Status, readVtpassPhase0Config } from './vtpass-config.js'

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

const CHECKPOINT_FACTORY_ADDRESS = publicEnv(
  'VITE_CHECKPOINT_FACTORY_ADDRESS',
  'CHECKPOINT_FACTORY_ADDRESS',
) || '0x8eEc65a18f3b5deb0E9Fc5e1eCf8263587b02927'

export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const privyAppId = publicEnv('VITE_PRIVY_APP_ID', 'PRIVY_APP_ID')
  const authBridge = publicEnv('VITE_AUTH_BRIDGE', 'AUTH_BRIDGE') || 'legacy'
  const billsConfig = readVtpassPhase0Config()
  const bills = publicVtpassPhase0Status(billsConfig)
  res.json({
    ok: true,
    auth: {
      authBridge,
      privyAppId,
      privyEnabled: Boolean(privyAppId && authBridge !== 'legacy'),
    },
    streampay: {
      checkpointFactoryAddress: CHECKPOINT_FACTORY_ADDRESS,
    },
    circle: {
      userWalletAppId: publicEnv('VITE_CIRCLE_USER_WALLET_APP_ID', 'CIRCLE_USER_WALLET_APP_ID'),
      arcTestnetUserWalletAppId: publicEnv(
        'VITE_CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
        'CIRCLE_USER_WALLET_APP_ID_ARC_TESTNET',
      ),
      evmEmailEnabled: String(process.env.VITE_CIRCLE_EVM_EMAIL_ENABLED ?? 'true').toLowerCase() !== 'false',
    },
    bills: {
      enabled: bills.billsEnabled && bills.canVend,
      environment: bills.environment,
      categories: bills.environment === 'sandbox' ? ['airtime', 'data'] : ['airtime'],
      minNgn: billsConfig.minNgn,
      maxNgn: billsConfig.maxNgn,
    },
  })
}
