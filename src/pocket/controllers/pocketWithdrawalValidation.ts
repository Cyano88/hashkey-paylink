import {supportsPocketUsdt} from '../lib/pocketUsdtAssets'
import { isAddress, parseUnits } from 'viem'
import { isValidSolanaAddress } from '../../lib/solanaAddress'
import type { PocketNetwork } from '../lib/pocketSchemas'

export function validatePocketWithdrawal({
  asset = 'USDC',
  network,
  address,
  amount,
  balance,
}: {
  asset?: 'USDC' | 'USDT'
  network: PocketNetwork
  address: string
  amount: string
  balance: number
}) {
  if (asset === 'USDT' && !supportsPocketUsdt(network)) throw new Error('USDT is not supported on this network.')
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim())) throw new Error('Enter an amount with up to six decimal places.')
  const recipient = address.trim()
  if (network === 'solana' ? !isValidSolanaAddress(recipient) : !isAddress(recipient)) {
    throw new Error('Enter a valid destination address for the selected network.')
  }
  let amountUnits: bigint
  try {
    amountUnits = parseUnits(amount || '0', 6)
  } catch {
    throw new Error('Enter a valid amount.')
  }
  if (amountUnits <= 0n) throw new Error('Enter an amount to withdraw.')
  if ((balance > 0 || asset === 'USDT') && amountUnits > parseUnits(String(balance), 6)) {
    throw new Error('Amount is higher than your wallet balance.')
  }
  return { recipient, amountUnits }
}
