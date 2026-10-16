// Rollout switch only, not a spending-control boundary. Privy must enforce
// sponsorship limits and have X Layer + TEE execution + billing enabled.
import {formatUnits} from 'viem'
export const xLayerTransferSponsorshipEnabled =
  import.meta.env?.VITE_XLAYER_TRANSFER_SPONSORSHIP === 'true'

export function stockTransferGasLabel(review: { sponsored?: boolean; fee: bigint; reimbursement?:{feeUnits:string;intent:{asset:string}} }, format: (fee: bigint) => string) {
  if(review.reimbursement)return formatUnits(BigInt(review.reimbursement.feeUnits),6)+' '+review.reimbursement.intent.asset
  return review.sponsored ? 'Covered by Pocket' : format(review.fee) + ' OKB'
}
