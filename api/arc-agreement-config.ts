import { getAddress, isAddress, type Address } from 'viem'

export const ARC_AGREEMENT_NETWORK = Object.freeze({
  name: 'Arc Mainnet',
  chainId: 5_042,
  circleDomain: 26,
  rpcUrl: 'https://rpc.mainnet.arc.io',
  rpcFallbackUrl: 'https://rpc.drpc.mainnet.arc.io',
  explorerUrl: 'https://explorer.arc.io',
  usdc: getAddress('0x3600000000000000000000000000000000000000'),
})

function requiredAddress(value: unknown, label: string): Address {
  const raw = String(value ?? '').trim()
  if (!isAddress(raw) || /^0x0{40}$/i.test(raw)) throw new Error(`${label} must be a non-zero EVM address.`)
  return getAddress(raw)
}

export function assertArcAgreementNetwork(input: { chainId: number; usdc: string }) {
  if (input.chainId !== ARC_AGREEMENT_NETWORK.chainId) {
    throw new Error(`Arc Agreements requires chain ${ARC_AGREEMENT_NETWORK.chainId}.`)
  }
  const usdc = requiredAddress(input.usdc, 'USDC address')
  if (usdc !== ARC_AGREEMENT_NETWORK.usdc) {
    throw new Error('Arc Agreements requires the official Arc Mainnet USDC contract.')
  }
  return { chainId: ARC_AGREEMENT_NETWORK.chainId, usdc }
}

export function arcAgreementRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const factory = requiredAddress(env.ARC_AGREEMENT_FACTORY_ADDRESS_MAINNET, 'ARC_AGREEMENT_FACTORY_ADDRESS_MAINNET')
  const operator = requiredAddress(env.ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET, 'ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET')
  if (factory === operator) throw new Error('Agreement factory and operator addresses must be different.')
  const rpcUrl = String(env.PRIVATE_RPC_URL_ARC_MAINNET ?? ARC_AGREEMENT_NETWORK.rpcUrl).trim()
  let parsedRpc: URL
  try {
    parsedRpc = new URL(rpcUrl)
  } catch {
    throw new Error('PRIVATE_RPC_URL_ARC_MAINNET must be a valid HTTPS URL.')
  }
  if (parsedRpc.protocol !== 'https:' || parsedRpc.username || parsedRpc.password) {
    throw new Error('PRIVATE_RPC_URL_ARC_MAINNET must be an HTTPS URL without embedded credentials.')
  }
  const confirmations = Number(env.ARC_AGREEMENT_CONFIRMATION_BLOCKS || 5)
  if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 128) {
    throw new Error('ARC_AGREEMENT_CONFIRMATION_BLOCKS must be a whole number from 1 to 128.')
  }
  return {
    ...ARC_AGREEMENT_NETWORK,
    factory,
    operator,
    rpcUrl: parsedRpc.toString(),
    rpcUrls: Array.from(new Set([
      parsedRpc.toString(),
      ARC_AGREEMENT_NETWORK.rpcUrl,
      ARC_AGREEMENT_NETWORK.rpcFallbackUrl,
    ].map(value => new URL(value).toString()))),
    confirmations,
  }
}
