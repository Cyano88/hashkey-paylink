// Shared wire format. No credentials or signing keys belong in this module.
export const SPONSOR_RPC_ORIGIN = 'https://api.privy.io'
export type SponsoredRequest = ReturnType<typeof makeSponsoredRequest>
export function makeSponsoredRequest(input: {
  appId: string; walletId: string; attemptId: string; expiresAt: number;
  from: string; to: string; data: string;
}) {
  return {
    version: 1 as const,
    method: 'POST' as const,
    url: `${SPONSOR_RPC_ORIGIN}/v1/wallets/${input.walletId}/rpc`,
    headers: {
      'privy-app-id': input.appId,
      'privy-idempotency-key': input.attemptId,
      'privy-request-expiry': String(input.expiresAt),
    },
    body: {
      chain_type: 'ethereum', method: 'eth_sendTransaction', caip2: 'eip155:196', sponsor: true,
      params: { transaction: { from: input.from, to: input.to, data: input.data, value: '0x0', chain_id: '0xc4' } },
    },
  }
}

export class SponsoredTransferNotSubmitted extends Error {
  readonly code = 'pocket_sponsor_not_submitted'
}
