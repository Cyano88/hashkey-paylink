import { getAddress, isAddress } from 'ethers'

export function mainnetDeploymentAddress(env: NodeJS.ProcessEnv, name: 'ARC_AGREEMENT_FACTORY_ADDRESS_MAINNET' | 'ARC_AGREEMENT_OPERATOR_ADDRESS_MAINNET') {
  const value = String(env[name] ?? '').trim()
  if (!isAddress(value) || /^0x0{40}$/i.test(value)) throw new Error(`${name} must be a non-zero mainnet address.`)
  return getAddress(value)
}

export function requireMainnetDeploymentChain(chainId: bigint | number) {
  if (BigInt(chainId) !== 5042n) throw new Error('Deployment verification requires Arc Mainnet chain 5042.')
}
