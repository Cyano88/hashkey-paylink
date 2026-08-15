import assert from 'node:assert/strict'
import { createPocketActivityHandler } from '../api/pocket/activity.ts'
import { mergeRegisteredPaycrestActivity, paycrestActivityTimestamp } from '../api/ng-pos.ts'
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

assert.equal(paycrestActivityTimestamp({
  created_at: '2026-08-10T10:00:00.000Z',
  updated_at: '2026-08-13T10:00:00.000Z',
}), Date.parse('2026-08-10T10:00:00.000Z'))
assert.equal(paycrestActivityTimestamp({
  updated_at: '2026-08-13T10:00:00.000Z',
}), Date.parse('2026-08-13T10:00:00.000Z'))

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

async function request(handler, method = 'GET', query = {}) {
  const res = responseRecorder()
  await handler({ method, headers: {}, query }, res)
  return res
}

const ownerIds = []
const readOptions = []
const handler = createPocketActivityHandler({
  verifyUser: async () => ({ userId: 'privy-user-1', email: 'ada@example.com' }),
  readHistory: async ownerId => {
    ownerIds.push(ownerId)
    return {
      merchants: [{ merchant_id: 'merchant-1', display_name: 'Ada Shop', source: 'pos', created_at: '2026-08-12T00:00:00.000Z' }],
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
  readWalletAddresses: async ownerId => {
    ownerIds.push(ownerId)
    return ['0x2222222222222222222222222222222222222222']
  },
  readExternalPayments: async wallets => {
    assert.deepEqual(wallets, ['0x2222222222222222222222222222222222222222'])
    return [{
      id: 'pex-polydesk-1', ownerId: 'partner:polydesk', idempotencyKey: 'checkout-polydesk-1', requestHash: 'hash',
      kind: 'service_funding', state: 'completed', asset: 'USDC', amount: '5', sourceNetwork: 'base', settlementNetwork: 'base',
      destinationType: 'partner_checkout', resourceId: 'chk_polydesk_1', transactionHash: '0xpolydesk', providerReference: 'pmf_1',
      metadata: {
        partnerId: 'polydesk', merchantName: 'PolyDesk', title: 'Fund Polymarket account', memo: 'Polymarket funding',
        payerWallet: '0x2222222222222222222222222222222222222222', provider: 'polymarket',
        receiptId: 'r1.test.signature', receiptUrl: '/receipt/r1.test.signature',
      },
      createdAt: 1_745_000_000_000, updatedAt: 1_745_000_000_000,
    }]
  },
  readCollections: async ownerId => [{
    eventId: 'collection_shys_wedding_01', ownerId, title: "Shy's wedding",
    paymentUrl: 'https://app.hashpaylink.com/pay?v=1&id=collection_shys_wedding_01',
    createdAt: 1_746_000_000_000, updatedAt: 1_746_000_000_000,
  }],
  readCollectionPayments: async eventIds => {
    assert.deepEqual(eventIds, ['collection_shys_wedding_01'])
    return [{
      eventId: 'collection_shys_wedding_01', txHash: '0xwedding', chain: 'base', payer: '0xguest',
      memo: 'Shy Guest', amount: '2', ts: 1_746_000_000_000,
    }]
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
  readWalletHistory: async (ownerId, options) => {
    ownerIds.push(ownerId)
    readOptions.push(options)
    return [{
      eventId: 'base:0xdeposit:1',
      txHash: '0xpolydesk',
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
assert.equal(loaded.body.merchants[0].display_name, 'Ada Shop')
assert.equal(loaded.body.collections[0].title, "Shy's wedding")
assert.deepEqual(ownerIds, ['privy-user-1', 'privy-user-1', 'privy-user-1', 'privy-user-1'])
assert.deepEqual(loaded.body.payments.map(row => row.txHash), ['0xwedding', '0xpolydesk', '0xbill', 'paycrest_intent-2', '0xolder'])
assert.equal(loaded.body.payments[0].source, 'collection')
assert.equal(loaded.body.payments[0].activityLabel, "Shy's wedding")
assert.equal(loaded.body.payments[0].paycrestStatus, 'confirmed')
assert.match(loaded.body.payments[0].receiptId, /^r1\./)
assert.equal(loaded.body.payments[1].source, 'purchase')
assert.equal(loaded.body.payments[1].activityLabel, 'PolyDesk funding')
assert.equal(loaded.body.payments[1].receiptId, 'r1.test.signature')
assert.equal(loaded.body.payments[2].source, 'bills')
assert.equal(loaded.body.payments[2].amountNgn, '100')
assert.equal(loaded.body.payments[2].paycrestStatus, 'test complete')
assert.equal(loaded.body.payments[2].activityLabel, 'Electricity sandbox test')
assert.equal(loaded.body.payments[2].providerReference, 'provider-bill-1')
assert.equal(loaded.body.payments[2].billToken, 'Token : 26362054405982757802')
assert.equal(loaded.body.payments[2].supportReference, 'VTpass 000 · 202607191200bill')
const serialized = JSON.stringify(loaded.body)
assert.equal(serialized.includes('privy-user-1'), false)
assert.equal(serialized.includes('ada@example.com'), false)
assert.equal(serialized.includes('must-not-leak'), false)
assert.equal(loaded.body.payments[3].bankName, 'Example Bank')
assert.equal(loaded.body.payments[3].bankLast4, '1234')
assert.equal(loaded.body.payments[3].accountName, 'Ada Lovelace')
assert.equal(serialized.includes('must-not-leak-bank-secret'), false)
assert.equal(serialized.includes('must-not-leak-wallet'), false)

ownerIds.length = 0
const recent = await request(handler, 'GET', { scope: 'recent' })
assert.equal(recent.statusCode, 200)
assert.equal(recent.body.payments.length, 4)
assert.deepEqual(recent.body.payments.map(row => row.txHash), ['0xwedding', '0xpolydesk', '0xbill', 'paycrest_intent-2'])
assert.deepEqual(recent.body.merchants, [])
assert.deepEqual(recent.body.collections, [])
assert.equal(readOptions.at(-1).recent, true)
assert.equal(readOptions.at(-1).limit, 4)
const invalidScope = await request(handler, 'GET', { scope: 'everything' })
assert.equal(invalidScope.statusCode, 400)
assert.equal(invalidScope.body.error.code, 'VALIDATION_FAILED')

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
