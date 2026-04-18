/**
 * @hashpaylink/sdk
 *
 * The Stripe of the Modular Future.
 * One line of code to accept stablecoins across Arc, Base, Starknet, and HashKey.
 *
 * @example
 * import { PayLinkButton } from '@hashpaylink/sdk'
 * <PayLinkButton recipientEVM="0xYour..." amount="10" memo="Coffee" />
 */

export { PayLinkButton } from './PayLinkButton'
export { CHAIN_META, PLATFORM_FEE_BPS, PLATFORM_TREASURY, arcChain, hashkeyMainnet } from './chains'
export type { ChainKey } from './chains'
export type { PayLinkButtonProps, PaymentSuccessParams, UsePayLinkReturn } from './types'
