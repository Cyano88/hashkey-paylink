import type { Address } from 'viem'
import type { ChainKey } from './chains'

type CircleLinkChain = Extract<ChainKey, 'base' | 'arbitrum' | 'arc' | 'solana'>

export type PrivyCircleLink = {
  privyUserId: string
  email?: string
  chain: CircleLinkChain
  purpose?: 'payment' | 'agent'
  circleWalletId: string
  circleWalletAddress: string
  circleBlockchain: string
  updatedAt: number
}

type LinkResponse = {
  ok?: boolean
  error?: string
  email?: string
  link?: PrivyCircleLink | null
}

async function privyCircleLinkApi(params: {
  accessToken: string
  action: 'resolve' | 'link'
  chain: CircleLinkChain
  purpose?: 'payment' | 'agent'
  email?: string
  wallet?: { id: string; address: string; blockchain: string }
}) {
  const res = await fetch('/api/privy-circle-link', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.accessToken}`,
    },
    body: JSON.stringify({
      action: params.action,
      chain: params.chain,
      purpose: params.purpose,
      email: params.email,
      wallet: params.wallet,
    }),
  })
  const data = await res.json().catch(() => ({})) as LinkResponse
  if (!res.ok || data.ok === false) throw new Error(data.error ?? 'Privy Circle link request failed.')
  return data
}

export async function resolvePrivyCircleLink(params: {
  accessToken: string
  chain: CircleLinkChain
  purpose?: 'payment' | 'agent'
}) {
  return privyCircleLinkApi({ ...params, action: 'resolve' })
}

export async function savePrivyCircleLink(params: {
  accessToken: string
  chain: CircleLinkChain
  purpose?: 'payment' | 'agent'
  email?: string
  wallet: { id: string; address: string; blockchain: string }
}) {
  return privyCircleLinkApi({ ...params, action: 'link' })
}
