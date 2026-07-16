import { isAddress, parseUnits, type Address } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { CHAIN_META } from '../../lib/chains'

type PocketEvmTransferExecutor = (input: {
  session: CircleEvmEmailSession
  recipient: Address
  amount: string
}) => Promise<`0x${string}` | null>

const defaultExecutor: PocketEvmTransferExecutor = async input => {
  const { sendCircleEvmEmailWithdraw } = await import('../../lib/circleEvmEmailWallet')
  return sendCircleEvmEmailWithdraw(input)
}

export async function executePocketEvmTransfer({
  session,
  linkedWalletAddress,
  recipient,
  amount,
  executor = defaultExecutor,
}: {
  session: CircleEvmEmailSession
  linkedWalletAddress: string
  recipient: Address
  amount: string
  executor?: PocketEvmTransferExecutor
}) {
  if (!['base', 'arbitrum', 'arc'].includes(session.chain)) {
    throw new Error('Circle Pocket EVM withdrawal does not support this network.')
  }
  if (!isAddress(session.wallet.address) || !isAddress(linkedWalletAddress)) {
    throw new Error('Circle Pocket linked wallet is invalid.')
  }
  if (session.wallet.address.toLowerCase() !== linkedWalletAddress.toLowerCase()) {
    throw new Error('Circle wallet session does not match the linked Pocket wallet.')
  }
  if (!isAddress(recipient)) throw new Error('Enter a valid EVM destination address.')
  if (!/^\d+(?:\.\d{1,6})?$/.test(amount.trim())) {
    throw new Error('Enter a valid USDC withdrawal amount.')
  }
  let amountUnits: bigint
  try {
    amountUnits = parseUnits(amount.trim(), CHAIN_META[session.chain].decimals)
  } catch {
    throw new Error('Enter a valid USDC withdrawal amount.')
  }
  if (amountUnits <= 0n) throw new Error('Enter a USDC withdrawal amount greater than zero.')
  const txHash = await executor({ session, recipient, amount })
  return { txHash }
}
