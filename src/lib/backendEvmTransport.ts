import { http } from 'viem'
import { pocketApiUrl } from '../pocket/lib/pocketRoutes'

/** Reads use our bounded backend. Wallet signing and Circle bundling stay with their SDKs. */
export function backendEvmTransport(network: 'base' | 'arc' | 'arbitrum' | 'polygon' | 'ethereum') {
  return http(pocketApiUrl(`/api/evm-read/${network}`), {
    batch: false,
    retryCount: 0,
    timeout: 22_000,
  })
}
