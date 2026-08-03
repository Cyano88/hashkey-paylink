import { createHash } from 'node:crypto'

type AgreementReceiptStatus = 'completed' | 'cancelled' | 'refunded'

type AgreementReceiptInput = {
  agreementId: string
  title: string
  description?: string
  template: 'fixed_unlock' | 'progressive_release' | 'milestone'
  status: AgreementReceiptStatus
  payer: string
  recipient: string
  escrow: string
  transactionHash: string
  eventId: string
  createdAt: string
  amountUsdcUnits: string
  releasedUsdcUnits: string
  returnedUsdcUnits: string
}

const ADDRESS = /^0x[a-f0-9]{40}$/i
const HASH = /^0x[a-f0-9]{64}$/i
const EVENT_ID = /^evt_[a-f0-9]{24}$/i
const AGREEMENT_ID = /^agr_[a-z0-9]{12,64}$/i

function usdc(units: string) {
  if (!/^\d{1,40}$/.test(units)) return ''
  const value = BigInt(units)
  const whole = value / 1_000_000n
  const decimal = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return decimal ? `${whole}.${decimal}` : whole.toString()
}

function templateLabel(template: AgreementReceiptInput['template']) {
  if (template === 'milestone') return 'Milestone agreement'
  if (template === 'progressive_release') return 'Progress agreement'
  return 'Fixed agreement'
}

function statusTitle(status: AgreementReceiptStatus) {
  if (status === 'completed') return 'Arc agreement completed'
  if (status === 'cancelled') return 'Arc agreement cancelled'
  return 'Arc agreement refunded'
}

export function createArcAgreementReceipt(input: AgreementReceiptInput) {
  const createdAt = Date.parse(input.createdAt)
  const amount = usdc(input.amountUsdcUnits)
  const releasedAmount = usdc(input.releasedUsdcUnits)
  const returnedAmount = usdc(input.returnedUsdcUnits)
  if (
    !AGREEMENT_ID.test(input.agreementId)
    || !EVENT_ID.test(input.eventId)
    || !HASH.test(input.transactionHash)
    || !ADDRESS.test(input.payer)
    || !ADDRESS.test(input.recipient)
    || !ADDRESS.test(input.escrow)
    || !Number.isFinite(createdAt)
    || !amount
    || !releasedAmount
    || !returnedAmount
  ) return null

  const canonical = JSON.stringify({
    agreementId: input.agreementId,
    eventId: input.eventId.toLowerCase(),
    transactionHash: input.transactionHash.toLowerCase(),
    status: input.status,
    payer: input.payer.toLowerCase(),
    recipient: input.recipient.toLowerCase(),
    escrow: input.escrow.toLowerCase(),
    amount,
    releasedAmount,
    returnedAmount,
  })
  const receiptHash = `0x${createHash('sha256').update(canonical).digest('hex')}`

  return {
    type: 'hashpaylink_arc_agreement_receipt',
    receiptId: `arc-${input.eventId}`,
    receiptHash,
    title: statusTitle(input.status),
    status: input.status,
    eventId: input.eventId,
    txHash: input.transactionHash,
    chain: 'arc',
    payer: input.payer,
    memo: input.description || input.title,
    amount,
    asset: 'USDC',
    createdAt,
    source: 'arc-agreement',
    settlementType: `arc_agreement_${input.status}`,
    recipient: input.recipient,
    destination: input.escrow,
    narration: input.title,
    referenceId: input.transactionHash,
    agreementId: input.agreementId,
    agreementStatus: input.status,
    agreementTemplate: templateLabel(input.template),
    escrowAddress: input.escrow,
    releasedAmount,
    returnedAmount,
    proof: { receiptHash },
  }
}
