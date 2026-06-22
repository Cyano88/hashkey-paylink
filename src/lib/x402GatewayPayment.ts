import { x402Client } from '@x402/core/client'
import { x402HTTPClient } from '@x402/core/http'
import { registerBatchScheme } from '@circle-fin/x402-batching/client'
import type { Address, Hex, WalletClient } from 'viem'

export type Settlement = {
  success?: boolean
  transaction?: string
  network?: string
  payer?: string
}

export type GatewaySignerParams = {
  domain: {
    name: string
    version: string
    chainId: number
    verifyingContract: Address
  }
  types: Record<string, { name: string; type: string }[]>
  primaryType: string
  message: Record<string, unknown>
}

export type GatewayX402Signer = {
  address: Address
  signTypedData(params: GatewaySignerParams): Promise<Hex>
}

export function walletClientGatewaySigner(walletClient: WalletClient, address: Address): GatewayX402Signer {
  return {
    address,
    signTypedData: async (params: GatewaySignerParams): Promise<Hex> => {
      return walletClient.signTypedData({
        ...params,
        account: address,
      } as Parameters<WalletClient['signTypedData']>[0])
    },
  }
}

export async function fetchWithGatewaySignerPayment<T>({
  url,
  signer,
}: {
  url: string
  signer: GatewayX402Signer
}) {
  const core = new x402Client()
  registerBatchScheme(core, {
    signer,
    networks: ['eip155:*'],
  })

  const http = new x402HTTPClient(core)
  const initial = await fetch(url, { cache: 'no-store' })
  if (initial.status !== 402) {
    const data = await initial.json() as T
    return { data, settlement: null as Settlement | null }
  }

  const body = await initial.json().catch(() => ({}))
  const required = http.getPaymentRequiredResponse(name => initial.headers.get(name), body)
  const payload = await http.createPaymentPayload(required)
  const paid = await fetch(url, {
    cache: 'no-store',
    headers: http.encodePaymentSignatureHeader(payload),
  })

  const data = await paid.json() as T
  if (!paid.ok || (data as { ok?: boolean }).ok === false) {
    const error = (data as { error?: string; message?: string }).error
      ?? (data as { error?: string; message?: string }).message
      ?? `Gateway payment failed with HTTP ${paid.status}.`
    throw new Error(error)
  }

  const settlement = (() => {
    try {
      return http.getPaymentSettleResponse(name => paid.headers.get(name)) as Settlement | null
    } catch {
      return null
    }
  })()

  return { data, settlement }
}

export async function fetchWithGatewayPayment<T>({
  url,
  walletClient,
  address,
}: {
  url: string
  walletClient: WalletClient
  address: Address
}) {
  return fetchWithGatewaySignerPayment<T>({
    url,
    signer: walletClientGatewaySigner(walletClient, address),
  })
}
