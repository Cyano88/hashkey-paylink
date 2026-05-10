import {
  createPublicClient,
  encodePacked,
  erc20Abi,
  getContract,
  hexToBigInt,
  http,
  maxUint256,
  parseErc6492Signature,
  type Address,
  type Hex,
  type WalletClient,
} from 'viem'
import { toAccount, type PrivateKeyAccount } from 'viem/accounts'
import { createBundlerClient, toSimple7702SmartAccount } from 'viem/account-abstraction'
import { arbitrum, base } from 'viem/chains'
import type { ChainKey } from './chains'
import { CHAIN_META } from './chains'
import { getCirclePaymasterConfig } from './circlePaymaster'

const EIP2612_ABI = [
  ...erc20Abi,
  {
    inputs: [{ internalType: 'address', name: 'owner', type: 'address' }],
    name: 'nonces',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'version',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const

type CirclePaymasterResult =
  | { status: 'sent'; txHash: Hex; userOpHash: Hex }
  | { status: 'unavailable'; reason: string }
  | { status: 'failed'; reason: string }

type SendCirclePaymasterPaymentParams = {
  chain: ChainKey
  walletClient: WalletClient
  payer: Address
  recipient: Address
  treasury: Address
  recipientUnits: bigint
  feeUnits: bigint
}

function chainForCircle(chain: ChainKey) {
  if (chain === 'base') return base
  if (chain === 'arbitrum') return arbitrum
  return null
}

function unwrap6492(signature: Hex) {
  try {
    return parseErc6492Signature(signature).signature
  } catch {
    return signature
  }
}

function isUnsupportedCircleError(err: unknown) {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return (
    msg.includes('signauthorization') ||
    msg.includes('wallet_signauthorization') ||
    msg.includes('method not found') ||
    msg.includes('method does not exist') ||
    msg.includes('not supported') ||
    msg.includes('unsupported') ||
    msg.includes('eip-7702') ||
    msg.includes('7702')
  )
}

function isRejected(err: unknown) {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  return msg.includes('user rejected') || msg.includes('user denied') || msg.includes('rejected the request')
}

async function createWalletOwner(walletClient: WalletClient, payer: Address): Promise<PrivateKeyAccount> {
  const owner = toAccount({
    address: payer,
    async signMessage({ message }) {
      return walletClient.signMessage({ account: payer, message })
    },
    async signTypedData(parameters) {
      return walletClient.signTypedData({ account: payer, ...(parameters as object) } as never)
    },
    async signTransaction() {
      throw new Error('Circle Paymaster does not use local transaction signing')
    },
    async signAuthorization(parameters) {
      const signer = walletClient as WalletClient & {
        signAuthorization?: (args: unknown) => Promise<unknown>
      }
      if (!signer.signAuthorization) throw new Error('wallet_signAuthorization is not supported by this wallet')
      return signer.signAuthorization({ account: payer, ...parameters }) as ReturnType<PrivateKeyAccount['signAuthorization']>
    },
  })
  return owner as PrivateKeyAccount
}

async function signCirclePermit({
  account,
  client,
  paymasterAddress,
  permitAmount,
  tokenAddress,
}: {
  account: { address: Address; signTypedData: (args: never) => Promise<Hex> }
  client: ReturnType<typeof createPublicClient> & {
    chain: { id: number }
    verifyTypedData: (args: never) => Promise<boolean>
  }
  paymasterAddress: Address
  permitAmount: bigint
  tokenAddress: Address
}) {
  const token = getContract({ client, address: tokenAddress, abi: EIP2612_ABI })
  const [name, version, nonce] = await Promise.all([
    token.read.name(),
    token.read.version(),
    token.read.nonces([account.address]),
  ])
  const permitData = {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    domain: {
      name,
      version,
      chainId: BigInt(client.chain!.id),
      verifyingContract: tokenAddress,
    },
    message: {
      owner: account.address,
      spender: paymasterAddress,
      value: permitAmount,
      nonce,
      deadline: maxUint256,
    },
  } as const

  const wrappedSignature = await account.signTypedData(permitData as never)
  const valid = await client.verifyTypedData({
    ...permitData,
    address: account.address,
    signature: wrappedSignature,
  } as never)
  if (!valid) throw new Error('Invalid Circle Paymaster permit signature')
  return unwrap6492(wrappedSignature)
}

export async function sendCirclePaymasterPayment({
  chain,
  walletClient,
  payer,
  recipient,
  treasury,
  recipientUnits,
  feeUnits,
}: SendCirclePaymasterPaymentParams): Promise<CirclePaymasterResult> {
  const config = getCirclePaymasterConfig(chain)
  const viemChain = chainForCircle(chain)
  if (!config || !viemChain) return { status: 'unavailable', reason: 'Circle Paymaster is not enabled for this chain' }

  try {
    const client = createPublicClient({ chain: viemChain, transport: http() })
    const owner = await createWalletOwner(walletClient, payer)
    const account = await toSimple7702SmartAccount({ client: client as never, owner })
    const usdc = getContract({ client, address: config.usdcAddress, abi: erc20Abi })
    const balance = await usdc.read.balanceOf([account.address])
    if (balance < recipientUnits + feeUnits) return { status: 'failed', reason: 'Insufficient USDC balance.' }

    const paymaster = {
      async getPaymasterData() {
        const permitAmount = 10_000_000n
        const permitSignature = await signCirclePermit({
          tokenAddress: config.usdcAddress,
          account,
          client: client as never,
          paymasterAddress: config.paymasterAddress,
          permitAmount,
        })
        return {
          paymaster: config.paymasterAddress,
          paymasterData: encodePacked(
            ['uint8', 'address', 'uint256', 'bytes'],
            [0, config.usdcAddress, permitAmount, permitSignature],
          ),
          paymasterVerificationGasLimit: 200_000n,
          paymasterPostOpGasLimit: 15_000n,
          isFinal: true,
        }
      },
    }

    const bundlerClient = createBundlerClient({
      account: account as never,
      client: client as never,
      paymaster: paymaster as never,
      userOperation: {
        estimateFeesPerGas: async ({ bundlerClient }: { bundlerClient: { request: (args: never) => Promise<{ standard: { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex } }> } }) => {
          const { standard: fees } = await bundlerClient.request({
            method: 'pimlico_getUserOperationGasPrice',
          } as never)
          return {
            maxFeePerGas: hexToBigInt((fees as { maxFeePerGas: Hex }).maxFeePerGas),
            maxPriorityFeePerGas: hexToBigInt((fees as { maxPriorityFeePerGas: Hex }).maxPriorityFeePerGas),
          }
        },
      },
      transport: http(config.bundlerUrl),
    }) as ReturnType<typeof createBundlerClient> & {
      sendUserOperation: (args: unknown) => Promise<Hex>
      waitForUserOperationReceipt: (args: { hash: Hex; timeout: number }) => Promise<{ receipt: { transactionHash: Hex } }>
    }

    const authorization = await owner.signAuthorization({
      chainId: config.chainId,
      nonce: await client.getTransactionCount({ address: owner.address }),
      contractAddress: (account as { authorization: { address: Address } }).authorization.address,
    })

    const userOpHash = await bundlerClient.sendUserOperation({
      account: account as never,
      calls: [
        {
          to: config.usdcAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [recipient, recipientUnits],
        },
        {
          to: config.usdcAddress,
          abi: erc20Abi,
          functionName: 'transfer',
          args: [treasury, feeUnits],
        },
      ],
      authorization,
    })
    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash, timeout: 120_000 })
    return { status: 'sent', userOpHash, txHash: receipt.receipt.transactionHash }
  } catch (err) {
    if (isRejected(err)) return { status: 'failed', reason: 'Circle Paymaster transaction rejected in wallet.' }
    if (isUnsupportedCircleError(err)) return { status: 'unavailable', reason: 'Wallet does not support the Circle EIP-7702 flow.' }
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'failed', reason: msg.slice(0, 160) || 'Circle Paymaster failed.' }
  }
}
