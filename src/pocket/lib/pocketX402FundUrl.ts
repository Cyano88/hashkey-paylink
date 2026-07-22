import { hashPayLinkAppOriginForOrigin, pocketBasePathForHostname } from './pocketRoutes'

export function buildPocketX402FundUrl({
  origin,
  network,
  walletAddress,
  now = Date.now(),
}: {
  origin: string
  network: 'base' | 'arc'
  walletAddress: string
  now?: number
}) {
  const sourceUrl = new URL(origin)
  const returnUrl = new URL(`${pocketBasePathForHostname(sourceUrl.hostname)}/home/x402`, sourceUrl.origin)
  const checkoutOrigin = hashPayLinkAppOriginForOrigin(sourceUrl.origin)
  const params = new URLSearchParams()
  params.set('id', `agent-x402-wallet-fund-${now.toString(36)}`)
  params.set('m', 'Fund Circle wallet: x402 wallet')
  params.set('n', network)
  params.set('f', '1')
  params.set('v', '1')
  params.set('x', '1')
  params.set('src', 'agent')
  params.set('walletManager', 'service')
  params.set('g', returnUrl.toString())
  params.set('ad', '1')
  params.set('e', walletAddress)
  return `${checkoutOrigin}/pay?${params.toString()}`
}
