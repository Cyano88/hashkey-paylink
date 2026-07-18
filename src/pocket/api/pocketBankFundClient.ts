export type PocketBankFundData = {
  intentId: string
  orderId: string
  status: string
  state: 'waiting' | 'processing' | 'funded' | 'expired' | 'refunded'
  amountNgn: string
  amountUsdc: string
  destinationNetwork: 'base'
  destinationAddress: string
  institution: string
  accountNumber: string
  accountName: string
  validUntil: string
  txHash: string
}

function parse(value: unknown): PocketBankFundData {
  const body = value as { ok?: boolean; data?: PocketBankFundData; error?: string }
  if (!body?.ok || !body.data) throw new Error(body?.error || 'Bank funding failed.')
  const data = body.data
  if (!data.intentId || !data.orderId || data.destinationNetwork !== 'base' || !data.destinationAddress || !data.amountNgn || !data.institution || !data.accountNumber || !data.accountName) {
    throw new Error('Bank funding response was invalid.')
  }
  if (!['waiting', 'processing', 'funded', 'expired', 'refunded'].includes(data.state)) throw new Error('Bank funding status was invalid.')
  return data
}

async function request(accessToken: string, body: Record<string, unknown>, idempotencyKey?: string) {
  const response = await fetch('/api/pocket/bank-fund', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
  })
  const value = await response.json().catch(() => undefined)
  if (!response.ok) throw new Error((value as any)?.error || 'Bank funding failed.')
  return parse(value)
}

export function preparePocketBankFund(input: {
  accessToken: string
  idempotencyKey: string
  amountNgn: string
  refundBankCode: string
  refundBankName: string
  refundAccountNumber: string
  refundAccountName: string
  firstName: string
  lastName: string
}) {
  return request(input.accessToken, {
    action: 'prepare',
    amount_ngn: input.amountNgn,
    refund_bank_code: input.refundBankCode,
    refund_bank_name: input.refundBankName,
    refund_account_number: input.refundAccountNumber,
    refund_account_name: input.refundAccountName,
    owner_first_name: input.firstName,
    owner_last_name: input.lastName,
    client_origin: window.location.origin,
  }, input.idempotencyKey)
}

export function readPocketBankFundStatus(input: { accessToken: string; intentId: string }) {
  return request(input.accessToken, { action: 'status', intent_id: input.intentId })
}
