import {
  createPublicClient,
  defineChain,
  fallback,
  http,
  parseAbiItem,
  TransactionReceiptNotFoundError,
} from 'viem'
import type { ArcAgreementActivationClient } from './arc-agreement-activation-attempts.js'
import { arcAgreementRuntimeConfig } from './arc-agreement-config.js'

export function createArcAgreementActivationClient(): ArcAgreementActivationClient {
  const runtime = arcAgreementRuntimeConfig()
  const client = createPublicClient({
    chain: defineChain({
      id: 5_042_002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
      rpcUrls: { default: { http: runtime.rpcUrls } },
    }),
    transport: fallback(
      runtime.rpcUrls.map(url => http(url, { timeout: 12_000, retryCount: 1 })),
      { retryCount: 1 },
    ),
  })
  return {
    getChainId: () => client.getChainId(),
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: async ({ blockNumber }) => {
      const block = await client.getBlock({ blockNumber })
      return { timestamp: block.timestamp }
    },
    getTransaction: async ({ hash }) => {
      const transaction = await client.getTransaction({ hash })
      return {
        hash: transaction.hash,
        from: transaction.from,
        to: transaction.to,
        input: transaction.input,
        value: transaction.value,
      }
    },
    getTransactionReceipt: async ({ hash }) => {
      try {
        const receipt = await client.getTransactionReceipt({ hash })
        return { status: receipt.status, blockNumber: receipt.blockNumber }
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null
        throw error
      }
    },
    findAgreementCreationTransaction: async ({ factory, agreementId, fromBlock }) => {
      const logs = await client.getLogs({
        address: factory,
        event: parseAbiItem('event AgreementCreated(bytes32 indexed agreementId,bytes32 indexed clientReference,bytes32 termsHash,address indexed escrow,address payer,address recipient,uint8 template,uint256 totalAmount,uint64 cancelUntil,uint64 expiresAt)'),
        args: { agreementId },
        fromBlock,
      })
      return logs[0]?.transactionHash ?? null
    },
    readContract: args => client.readContract(args as never),
  }
}
