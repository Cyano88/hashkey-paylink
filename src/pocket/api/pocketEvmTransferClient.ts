import { isAddress, parseUnits, type Address } from 'viem'
import type { CircleEvmEmailSession } from '../../lib/circleEvmEmailWallet'
import { CHAIN_META } from '../../lib/chains'

type PocketEvmTransferExecutor = (input: {
  session: CircleEvmEmailSession
  recipient: Address
  amount: string
}) => Promise<`0x${string}` | null>

type PocketEvmTransferConfirmer = (input: {
  chain: 'base' | 'arbitrum' | 'arc'
  txHash: `0x${string}`
}) => Promise<'confirmed' | 'submitted'>

const defaultExecutor: PocketEvmTransferExecutor = async input => {
  const { sendCircleEvmEmailWithdraw } = await import('../../lib/circleEvmEmailWallet')
  return sendCircleEvmEmailWithdraw(input)
}

const defaultConfirmer: PocketEvmTransferConfirmer = async ({ chain, txHash }) => {
  try {
    const { EVM_CLIENTS } = await import('../../lib/router')
    const receipt = await EVM_CLIENTS[chain].waitForTransactionReceipt({ hash: txHash, confirmations: 1, timeout: 45_000 })
    if (receipt.status === 'reverted') throw new Error('Withdrawal transaction reverted on-chain.')
    return 'confirmed'
  } catch (reason) {
    if (reason instanceof Error && reason.message === 'Withdrawal transaction reverted on-chain.') throw reason
    return 'submitted'
  }
}

export async function executePocketEvmTransfer({
  session,
  linkedWalletAddress,
  recipient,
  amount,
  confirm = true,
  executor = defaultExecutor,
  confirmer = defaultConfirmer,
}: {
  session: CircleEvmEmailSession
  linkedWalletAddress: string
  recipient: Address
  amount: string
  confirm?: boolean
  executor?: PocketEvmTransferExecutor
  confirmer?: PocketEvmTransferConfirmer
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
  if (!txHash) return { txHash, status: 'submitted' as const }
  if (!confirm) return { txHash, status: 'submitted' as const }
  const status = await confirmer({ chain: session.chain, txHash })
  return { txHash, status }
}
