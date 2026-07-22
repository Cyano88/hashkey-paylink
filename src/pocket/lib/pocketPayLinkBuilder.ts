import { setPaylinkParam } from '../../lib/paylinkParams'
import type { PocketNetwork } from './pocketSchemas'
import { hashPayLinkAppOriginForOrigin } from './pocketRoutes'

type PocketPayLinkFx = {
  shown: boolean
  currency: string
  source: 'live' | 'custom'
  customRate: string
}

export function buildPocketPayLink({
  origin,
  network,
  multiChain,
  flexibleAmount,
  amount,
  evmAddress,
  solanaAddress,
  memo,
  eventMode = false,
  eventId = '',
  fx,
  agentUrl = '',
}: {
  origin: string
  network: PocketNetwork
  multiChain: boolean
  flexibleAmount: boolean
  amount: string
  evmAddress: string
  solanaAddress: string
  memo: string
  eventMode?: boolean
  eventId?: string
  fx?: PocketPayLinkFx
  agentUrl?: string
}) {
  const params = multiChain
    ? new URLSearchParams({ x: '1' })
    : new URLSearchParams({ n: network })

  if (flexibleAmount) params.set('f', '1')
  else params.set('a', amount)

  if (multiChain) {
    setPaylinkParam(params, 'e', evmAddress)
    setPaylinkParam(params, 's', solanaAddress)
  } else if (network === 'solana') {
    setPaylinkParam(params, 's', solanaAddress)
  } else {
    setPaylinkParam(params, 'e', evmAddress)
  }
  setPaylinkParam(params, 'm', memo)

  if (eventMode && eventId) {
    params.set('v', '1')
    params.set('id', eventId)
  }
  if (fx?.shown && fx.currency) {
    params.set('fx', fx.currency)
    params.set('fs', '1')
    if (fx.source === 'custom' && Number.parseFloat(fx.customRate) > 0) {
      params.set('xs', 'custom')
      params.set('xr', fx.customRate)
    }
  }
  setPaylinkParam(params, 'g', agentUrl)

  return `${hashPayLinkAppOriginForOrigin(origin)}/pay?${params.toString()}`
}
