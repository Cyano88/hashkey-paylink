import { encodeFunctionData, getAddress, parseAbi, parseUnits, zeroAddress, type Address } from 'viem'
import { POCKET_EARN_ASSETS } from './pocketEarn'

// Pinned Aave DAO AaveV3XLayer pool. Shared by the client and sponsorship validator.
export const POCKET_EARN_POOL = '0xE3F3Caefdd7180F884c01E57f65Df979Af84f116' as const
const tokenAbi = parseAbi(['function approve(address spender,uint256 amount) returns(bool)'])
const poolAbi = parseAbi([
  'function supply(address asset,uint256 amount,address onBehalfOf,uint16 referralCode)',
  'function withdraw(address asset,uint256 amount,address to) returns(uint256)',
])
export type EarnAction = 'approve' | 'deposit' | 'withdraw'
export function preparePocketEarnCall(input: { action: EarnAction; symbol: string; amount: string; owner: Address }) {
  const asset = POCKET_EARN_ASSETS.find(item => item.symbol === input.symbol)
  if (!asset) throw new Error('Unsupported Earn asset')
  if (!/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(input.amount)) throw new Error('Enter a valid amount')
  const amount = parseUnits(input.amount, 6)
  if (amount <= 0n || amount >= 2n ** 256n - 1n) throw new Error('Enter a valid amount')
  const owner = getAddress(input.owner)
  if (owner === zeroAddress) throw new Error('Invalid wallet')
  const common = { chainId: 196 as const, from: owner, value: 0n }
  if (input.action === 'approve') return { ...common, to: asset.address, data: encodeFunctionData({ abi: tokenAbi, functionName: 'approve', args: [POCKET_EARN_POOL, amount] }) }
  if (input.action === 'deposit') return { ...common, to: POCKET_EARN_POOL, data: encodeFunctionData({ abi: poolAbi, functionName: 'supply', args: [asset.address, amount, owner, 0] }) }
  if (input.action === 'withdraw') return { ...common, to: POCKET_EARN_POOL, data: encodeFunctionData({ abi: poolAbi, functionName: 'withdraw', args: [asset.address, amount, owner] }) }
  throw new Error('Unsupported Earn action')
}
