import assert from 'node:assert/strict'
import { createPocketActivityHandler } from '../api/pocket/activity.ts'
import { mergeRegisteredPaycrestActivity } from '../api/ng-pos.ts'
import { isPocketActivityReadData } from '../src/pocket/lib/pocketSchemas.ts'

const registeredPayout = {
  eventId: 'ngpos-bank-withdraw-1',
  txHash: `0x${'a'.repeat(64)}`,
  ts: 1_720_000_000_000,
  receiptId: 'signed-receipt-id',
  source: 'bank-withdraw',
}
const providerPayout = {
  eventId: 'ngpos-bank-withdraw-1',
  txHash: registeredPayout.txHash,
  ts: 1_720_000_100_000,
  source: 'bank-withdraw',
  paycrestStatus: 'settled',
  direction: 'out',
  bankName: 'Moniepoint MFB',
  bankLast4: '0573',
}
const [enrichedPayout] = mergeRegisteredPaycrestActivity([registeredPayout], [providerPayout])
assert.equal(enrichedPayout.paycrestStatus, 'settled')
assert.equal(enrichedPayout.direction, 'out')
assert.equal(enrichedPayout.bankName, 'Moniepoint MFB')
assert.equal(enrichedPayout.receiptId, 'signed-receipt-id')
assert.equal(enrichedPayout.ts, registeredPayout.ts)

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code
      return this
    },
    json(body) {
      this.body = body
      return this
    },
  }
}

async function request(handler, method = 'GET') {
  const res = responseRecorder()
  await handler({ method, headers: {} }, res)
  return res
}

const ownerIds = []
const handler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readHistory: async ownerId => {
    ownerIds.push(ownerId)
    return {
      payments: [
        {
          eventId: 'ngpos-merchant-1',
          txHash: '0xolder',
          chain: 'base',
          payer: 'Circle wallet payer',
          memo: 'Retail POS payment',
          amount: '2.5',
          ts: 1_720_000_000_000,
          source: 'ngpos',
          merchantId: 'merchant-1',
          internalOwnerId: 'must-not-leak',
        },
        {
          eventId: 'ngpos-merchant-2',
          txHash: 'paycrest_intent-2',
          chain: 'base',
          payer: 'Circle wallet payer',
          memo: 'Bank receive payment',
          amount: '3.75',
          ts: 1_730_000_000_000,
          source: 'bank-receive',
          settlementType: 'INSTANT_FIAT',
          amountNgn: '6000',
          paycrestStatus: 'settled',
          bankName: 'Example Bank',
          bankLast4: '1234',
          accountName: 'Ada Lovelace',
          internalBankSecret: 'must-not-leak-bank-secret',
        },
      ],
    }
  },
  readActions: async () => [{
    id: 'marketplace-action-1',
    ownerId: 'privy-user-1',
    idempotencyKey: 'pocket:marketplace:activity-0001',
    action: 'marketplace.service.purchase',
    status: 'submitted',
    metadata: { provider: 'AIsa API', amount: '0.008', network: 'base', resource: 'https://service.example/ticker', paymentState: 'needs_review' },
    createdAt: 1_740_000_000_000,
    updatedAt: 1_740_000_000_000,
  }],
  readWalletHistory: async ownerId => {
    ownerIds.push(ownerId)
    return [{
      eventId: 'base:0xdeposit:1',
      txHash: '0xdeposit',
      chain: 'base',
      payer: '0xpayer',
      memo: 'USDC deposit',
      amount: '1.5',
      ts: 1_735_000_000_000,
      source: 'wallet-deposit',
      contextLabel: 'From 0xpayer',
      settlementType: 'wallet_transfer',
      paycrestStatus: 'confirmed',
      internalWalletId: 'must-not-leak-wallet',
    }]
  },
  readBills: async ownerId => {
    ownerIds.push(ownerId)
    return [{
      id: 'bill-intent-1', ownerId, idempotencyKey: 'bill:activity:test:0001', requestFingerprint: '{}', requestId: '202607191200bill',
      state: 'delivered', category: 'electricity', serviceId: 'ikeja-electric', serviceName: 'Ikeja Electric', variationCode: 'prepaid', variationName: 'Prepaid meter', phone: '1111111111111',
      amountNgn: '100', amountNgnMinor: '10000', amountUsdc: '0.071429', fxRateNgnPerUsdc: '1400', network: 'base',
      treasuryAddress: '0x1111111111111111111111111111111111111111', payerWallet: '0x2222222222222222222222222222222222222222',
      quoteExpiresAt: 1_740_000_000_000, txHash: '0xbill', providerCode: '000', providerStatus: 'delivered', providerTransactionId: 'provider-bill-1',
      providerEnvironment: 'sandbox',
      providerDescription: 'TRANSACTION SUCCESSFUL', purchasedCode: 'Token : 26362054405982757802', providerAttemptedAt: 1_738_000_000_000, requeryAttempts: 1, lastRequeryAt: 1_738_000_000_000,
      refundTxHash: '', failureReason: '', createdAt: 1_737_000_000_000, updatedAt: 1_738_000_000_000,
    }]
  },
})

const wrongMethod = await request(handler, 'POST')
assert.equal(wrongMethod.statusCode, 405)
assert.equal(wrongMethod.body.error.code, 'VALIDATION_FAILED')

const loaded = await request(handler)
assert.equal(loaded.statusCode, 200)
assert.equal(loaded.body.ok, true)
assert.equal(isPocketActivityReadData(loaded.body), true)
assert.deepEqual(ownerIds, ['privy-user-1', 'privy-user-1', 'privy-user-1'])
assert.deepEqual(loaded.body.payments.map(row => row.txHash), ['pocket-action:marketplace-action-1', '0xbill', '0xdeposit', 'paycrest_intent-2', '0xolder'])
assert.equal(loaded.body.payments[0].source, 'app-pay')
assert.equal(loaded.body.payments[0].paycrestStatus, 'needs review')
assert.equal(loaded.body.payments[0].contextLabel, 'Payment outcome needs review before retrying')
assert.equal(loaded.body.payments[1].source, 'bills')
assert.equal(loaded.body.payments[1].amountNgn, '100')
assert.equal(loaded.body.payments[1].paycrestStatus, 'test complete')
assert.equal(loaded.body.payments[1].activityLabel, 'Electricity sandbox test')
assert.equal(loaded.body.payments[1].providerReference, 'provider-bill-1')
assert.equal(loaded.body.payments[1].billToken, 'Token : 26362054405982757802')
assert.equal(loaded.body.payments[1].supportReference, 'VTpass 000 · 202607191200bill')
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('ada@example.com'), false)
assert.equal(serialized.includes('must-not-leak'), false)
assert.equal(loaded.body.payments[3].bankName, 'Example Bank')
assert.equal(loaded.body.payments[3].bankLast4, '1234')
assert.equal(loaded.body.payments[3].accountName, 'Ada Lovelace')
assert.equal(serialized.includes('must-not-leak-bank-secret'), false)
assert.equal(serialized.includes('must-not-leak-wallet'), false)

const refundActivityHandler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readHistory: async () => ({ payments: [] }),
  readActions: async () => [],
  readBillsRefundPolicy: () => ({ enabled: true, treasuryAddress: '0x1111111111111111111111111111111111111111' }),
  readBills: async ownerId => [
    {
      id: 'claimable-refund', ownerId, state: 'refund_eligible', category: 'airtime', serviceName: 'MTN Airtime', phone: '08011111111',
      amountNgn: '100', amountUsdc: '0.072', network: 'base', treasuryAddress: '0x1111111111111111111111111111111111111111',
      txHash: '0xclaimable', providerEnvironment: 'sandbox', updatedAt: 1_740_000_000_000, providerTransactionId: '', refundTxHash: '',
    },
    {
      id: 'legacy-refund', ownerId, state: 'refund_pending', category: 'airtime', serviceName: 'MTN Airtime', phone: '08011111111',
      amountNgn: '100', amountUsdc: '0.072', network: 'base', treasuryAddress: '0x3333333333333333333333333333333333333333',
      txHash: '0xlegacy', providerEnvironment: 'sandbox', updatedAt: 1_739_000_000_000, providerTransactionId: '', refundTxHash: '',
    },
    {
      id: 'unverified-legacy-refund', ownerId, state: 'refund_pending', category: 'airtime', serviceName: 'MTN Airtime', phone: '08011111111',
      amountNgn: '100', amountUsdc: '0.072', network: 'base', treasuryAddress: '0x1111111111111111111111111111111111111111',
      txHash: '0xunverifiedlegacy', providerEnvironment: 'sandbox', updatedAt: 1_738_000_000_000, providerTransactionId: '', refundTxHash: '',
    },
    {
      id: 'review-refund', ownerId, state: 'needs_review', category: 'electricity', serviceName: 'Ikeja Electric', phone: '1111111111111',
      amountNgn: '500', amountUsdc: '0.363154', network: 'base', treasuryAddress: '0x1111111111111111111111111111111111111111',
      txHash: '0xreview', providerEnvironment: 'sandbox', updatedAt: 1_737_000_000_000, providerTransactionId: '', refundTxHash: '',
    },
  ],
})
const refundActivity = await request(refundActivityHandler)
assert.equal(refundActivity.body.payments.find(row => row.merchantId === 'claimable-refund').refundAction, 'claim')
assert.equal(refundActivity.body.payments.find(row => row.merchantId === 'legacy-refund').refundAction, undefined)
assert.equal(refundActivity.body.payments.find(row => row.merchantId === 'unverified-legacy-refund').refundAction, undefined)
assert.equal(refundActivity.body.payments.find(row => row.merchantId === 'review-refund').refundAction, 'check')

const unauthorizedHandler = createPocketActivityHandler({
  verifyUser: async () => { throw Object.assign(new Error('Missing Privy access token.'), { status: 401 }) },
  readHistory: async () => ({ payments: [] }),
  readActions: async () => [],
})
const unauthorized = await request(unauthorizedHandler)
assert.equal(unauthorized.statusCode, 401)
assert.equal(unauthorized.body.error.code, 'AUTH_REQUIRED')

const unavailableHandler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readHistory: async () => { throw Object.assign(new Error('Activity store unavailable.'), { status: 503 }) },
  readActions: async () => [],
})
const unavailable = await request(unavailableHandler)
assert.equal(unavailable.statusCode, 503)
assert.equal(unavailable.body.error.code, 'PROVIDER_UNAVAILABLE')
assert.equal(unavailable.body.error.retryable, true)

const invalidRowHandler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1' }),
  readHistory: async () => ({ payments: [{ eventId: 'broken' }] }),
  readActions: async () => [],
})
const invalidRow = await request(invalidRowHandler)
assert.equal(invalidRow.statusCode, 503)
assert.equal(invalidRow.body.error.code, 'PROVIDER_UNAVAILABLE')

console.log('Circle Pocket activity adapter smoke tests passed.')
