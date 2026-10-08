// Rollout switch only, not a spending-control boundary. Privy must enforce
// sponsorship limits and have X Layer + TEE execution + billing enabled.
export const xLayerTransferSponsorshipEnabled =
  import.meta.env?.VITE_XLAYER_TRANSFER_SPONSORSHIP === 'true'

export function stockTransferGasLabel(review: { sponsored?: boolean; fee: bigint }, format: (fee: bigint) => string) {
  return review.sponsored ? 'Covered by Pocket' : format(review.fee) + ' OKB'
}
