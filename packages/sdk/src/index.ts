/**
 * @hashpaylink/sdk
 *
 * Stateless, non-custodial USDC payment links for React apps.
 *
 * @example
 * import { PayLinkButton } from '@hashpaylink/sdk'
 * <PayLinkButton recipientEVM="0xYour..." amount="10" memo="Coffee" />
 */

export { PayLinkButton } from './PayLinkButton'
export {
  CHAIN_META,
  SUPPORTED_NETWORKS,
  PLATFORM_FEE_BPS,
  PLATFORM_TREASURY,
  EVM_TREASURY,
  SOLANA_TREASURY_OWNER,
} from './chains'
export {
  buildPayLinkUrl,
  isLikelySolanaAddress,
  isSupportedNetwork,
  isValidEvmAddress,
  isValidUsdcAmount,
} from './url'
export type { ChainKey } from './chains'
export type { PayLinkButtonProps, PayLinkUrlOptions, PaymentSuccessParams, UsePayLinkReturn } from './types'
