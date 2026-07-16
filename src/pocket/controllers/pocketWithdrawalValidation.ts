import { isAddress, parseUnits } from 'viem'
import { isValidSolanaAddress } from '../../lib/solanaAddress'
import type { PocketNetwork } from '../lib/pocketSchemas'

export function validatePocketWithdrawal({
  network,
  address,
  amount,
  balance,
}: {
  network: PocketNetwork
  address: string
  amount: string
  balance: number
}) {
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
  if (balance > 0 && amountUnits > parseUnits(String(balance), 6)) {
    throw new Error('Amount is higher than your wallet balance.')
  }
  return { recipient, amountUnits }
}
