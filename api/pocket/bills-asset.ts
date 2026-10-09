import {BASE_STABLECOINS, type BaseStablecoin} from '../../src/lib/baseStablecoins.js'

// Missing asset identifies historical USDC records. Unknown assets fail closed.
export function billAsset(value: unknown): BaseStablecoin {
  if (value === undefined || value === 'USDC') return 'USDC'
  if (value === 'USDT') return 'USDT'
  throw Object.assign(new Error('Unsupported bill payment asset.'), {status: 400})
}
export function billToken(value: unknown) { return BASE_STABLECOINS[billAsset(value)] }
