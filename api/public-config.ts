import type { Request, Response } from 'express'
import { runtimePublicConfig } from './runtime-public-config.js'
import { publicVtpassPhase0Status, readVtpassPhase0Config } from './vtpass-config.js'

function publicEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim()
    if (value) return value
  }
  return ''
}

export default function handler(_req: Request, res: Response) {
  res.setHeader('Cache-Control', 'no-store')
  const billsConfig = readVtpassPhase0Config()
  const bills = publicVtpassPhase0Status(billsConfig)
  res.json({
    ok: true,
    ...runtimePublicConfig(),
    circle: {
      userWalletAppId: publicEnv('VITE_CIRCLE_USER_WALLET_APP_ID', 'CIRCLE_USER_WALLET_APP_ID'),
      arcUserWalletAppId: publicEnv(
        'VITE_CIRCLE_USER_WALLET_APP_ID',
        'CIRCLE_USER_WALLET_APP_ID',
      ),
      evmEmailEnabled: String(process.env.VITE_CIRCLE_EVM_EMAIL_ENABLED ?? 'true').toLowerCase() !== 'false',
    },
    bills: {
      enabled: bills.billsEnabled && bills.canVend,
      environment: bills.environment,
      categories: bills.liveCategories,
    },
  })
}
