// Provider metadata is informational; settled/refunded remain authoritative.
export function paycrestComplianceFields(data: any, event?: unknown) {
 const detail = data?.statusDetail === 'under_review' || event === 'payment_order.compliance_hold' ? 'under_review' as const : undefined
 const reason = ['payer_mismatch','payer_unverified'].includes(data?.refundReason) ? data.refundReason as 'payer_mismatch'|'payer_unverified' : undefined
 return {status_detail: detail, refund_reason: reason}
}
