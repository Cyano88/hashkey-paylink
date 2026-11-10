/** Shared USDC checkout pricing. Integer base units prevent quote/execution drift. */
export const PLATFORM_FEE_BPS = 25
export const EVM_PLATFORM_TREASURY = '0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753'
export function paymentFeeBreakdown(amount: bigint, networkFee = 0n, mode: 'gross' | 'net' = 'gross', exempt = false) {
  if (amount <= 0n || networkFee < 0n) throw new Error('Invalid payment amount.')
  const platformFee = exempt ? 0n : amount * BigInt(PLATFORM_FEE_BPS) / 10_000n
  const treasury = platformFee + networkFee
  const recipient = mode === 'gross' ? amount : amount - treasury
  const total = mode === 'gross' ? amount + treasury : amount
  if (recipient <= 0n || total >= 2n ** 256n) throw new Error('Amount cannot cover payment fees.')
  return { platformFee, networkFee, treasury, recipient, total }
}

/** Version is authenticated with the quote. Missing means the historical combined treasury. */
export type FeeRouting = {feeRoutingVersion?: 2}
export const EVM_GAS_REIMBURSEMENT = '0xbf36A13d26DF07dbb7A9a1eed1b5a575D4AdA822' as const
export const SOLANA_GAS_REIMBURSEMENT = 'Gs7RTc4iW5HE7r1s9AC2UwgEhb4uJ5vxZ9idFHh6x73J' as const
export const SOLANA_PLATFORM_TREASURY = 'Cj7mBKS9uW9zbkfTwCKReEVRGYQD1QJZkA7VbzuUERaA' as const
export function validateFeeRouting(q:FeeRouting){
  if(q.feeRoutingVersion!==undefined&&q.feeRoutingVersion!==2)throw Error('Unsupported fee routing version.')
}
export function evmGasRecipient(q:FeeRouting):`0x${string}`{
  validateFeeRouting(q)
  return q.feeRoutingVersion===2?EVM_GAS_REIMBURSEMENT:EVM_PLATFORM_TREASURY
}
export function evmFeeTransfers(q:FeeRouting,platform:bigint,gas:bigint){
  validateFeeRouting(q)
  if(platform<0n||gas<0n)throw Error('Invalid fee amounts.')
  const rows:Array<{recipient:`0x${string}`;units:bigint}>=q.feeRoutingVersion===2?[{recipient:EVM_PLATFORM_TREASURY,units:platform},{recipient:EVM_GAS_REIMBURSEMENT,units:gas}]:[{recipient:EVM_PLATFORM_TREASURY,units:platform+gas}]
  return rows.filter(x=>x.units>0n)
}
export function solanaFeeTransfers(q:FeeRouting,platform:bigint,gas:bigint,gasRecipient:string){
  validateFeeRouting(q)
  if(platform<0n||gas<0n||!gasRecipient)throw Error('Invalid Solana fee configuration.')
  const rows=q.feeRoutingVersion===2?[{recipient:SOLANA_PLATFORM_TREASURY,units:platform},{recipient:gasRecipient,units:gas}]:[{recipient:gasRecipient,units:platform+gas}]
  return rows.filter(x=>x.units>0n)
}
