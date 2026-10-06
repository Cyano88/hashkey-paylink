import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createPaymentExecutionRepository } from '../api/pocket/payment-execution-intents.ts'
import { stockAssets } from '../src/pocket/lib/pocketXStocksWallet.ts'

const root = await mkdtemp(join(tmpdir(), 'pocket-payment-execution-'))
try {
  let clock = 100
  let sequence = 0
  const ledgerEvents = []
  const repository = createPaymentExecutionRepository({
    storePath: join(root, 'intents.json'), durable: false, isRender: false,
    now: () => ++clock, createId: () => `pex_test_${++sequence}`, appendLedger: async event => { ledgerEvents.push(event); return event },
  })
  const request = {
    ownerId: 'privy-user-1', idempotencyKey: 'pocket:bank-payout:test-0001', kind: 'bank_payout',
    amount: '2.1875', sourceNetwork: 'arbitrum', settlementNetwork: 'base', destinationType: 'verified_bank_account',
    metadata: { bankCode: '001', bankLast4: '6789' },
  }
  const created = await repository.create(request)
  assert.equal(created.replayed, false)
  assert.equal(created.intent.state, 'prepared')
  assert.equal(created.intent.asset, 'USDC')
  assert.equal(ledgerEvents[0].state, 'prepared')
  const replay = await repository.create({ ...request, metadata: { bankLast4: '6789', bankCode: '001' } })
  assert.equal(replay.replayed, true)
  assert.equal(replay.intent.id, created.intent.id)
  assert.equal((await repository.findByIdempotency(request.ownerId, request.kind, request.idempotencyKey))?.id, created.intent.id)
  assert.equal(await repository.findByIdempotency('another-user', request.kind, request.idempotencyKey), undefined)
  await assert.rejects(repository.create({ ...request, amount: '3' }), /another payment request/i)
  assert.equal(await repository.get('another-user', created.intent.id), undefined)
  const authorized = await repository.update({ ownerId: request.ownerId, intentId: created.intent.id, state: 'authorized', resourceId: 'provider-intent-1' })
  assert.equal(authorized.state, 'authorized')
  const submitted = await repository.update({ ownerId: request.ownerId, intentId: created.intent.id, state: 'submitted', transactionHash: '0xtest' })
  assert.equal(submitted.transactionHash, '0xtest')
  const processing = await repository.update({ ownerId: request.ownerId, intentId: created.intent.id, state: 'processing' })
  assert.equal(processing.state, 'processing')
  const completed = await repository.update({ ownerId: request.ownerId, intentId: created.intent.id, state: 'completed', providerReference: 'order-1' })
  assert.equal(completed.state, 'completed')
  assert.deepEqual(ledgerEvents.slice(0, 6).map(event => event.state), ['prepared', 'authorized', 'submitted', 'processing', 'completed'])
  await assert.rejects(repository.update({ ownerId: request.ownerId, intentId: created.intent.id, state: 'submitted' }), /cannot move/i)
  await assert.rejects(repository.update({ ownerId: 'another-user', intentId: created.intent.id, state: 'completed' }), /not found/i)
  const reviewCreated = await repository.create({ ...request, idempotencyKey: 'pocket:bill-payment:test-review-0001', kind: 'bill_payment' })
  await repository.update({ ownerId: request.ownerId, intentId: reviewCreated.intent.id, state: 'needs_review' })
  const reconciled = await repository.update({ ownerId: request.ownerId, intentId: reviewCreated.intent.id, state: 'completed', providerReference: 'vtpass-request-1' })
  assert.equal(reconciled.state, 'completed')
  const productionRepository = createPaymentExecutionRepository({ storePath: join(root, 'production.json'), durable: false, isRender: true })
  const stock = stockAssets[0]
  const token = { chainId: 196, address: stock.address, symbol: stock.symbol, decimals: 18 }
  const stockRequest = { ...request, kind: 'hosted_checkout', idempotencyKey: 'stock-checkout-test-1', token, amount: '0.000000000000000001', sourceNetwork: 'xlayer', settlementNetwork: 'xlayer' }
  const stockIntent = await repository.create(stockRequest)
  assert.equal(stockIntent.intent.asset, stock.symbol)
  assert.equal(stockIntent.intent.amount, stockRequest.amount)
  assert.equal(ledgerEvents.at(-1).asset, stock.symbol)
  assert.equal(ledgerEvents.at(-1).metadata.tokenDecimals, '18')
  assert.equal(ledgerEvents.at(-1).metadata.tokenAddress.toLowerCase(), stock.address.toLowerCase())
  assert.equal((await repository.create(stockRequest)).replayed, true)
  const immutable = await repository.update({ ownerId: request.ownerId, intentId: stockIntent.intent.id, state: 'authorized', metadata: { tokenSymbol: 'USDC', tokenDecimals: '6', tokenAddress: 'wrong' } })
  assert.equal(immutable.metadata.tokenSymbol, stock.symbol)
  assert.equal(immutable.metadata.tokenDecimals, '18')
  assert.equal(immutable.metadata.tokenAddress.toLowerCase(), stock.address.toLowerCase())
  await assert.rejects(repository.create({ ...stockRequest, token: { ...token, decimals: 17 } }), /invalid|another payment/)
  await assert.rejects(repository.create({ ...stockRequest, amount: '0.0000000000000000001' }), /amount is invalid/)
  await assert.rejects(repository.create({ ...stockRequest, sourceNetwork: 'base' }), /token is invalid/)
  await assert.rejects(repository.create({ ...stockRequest, token: { ...token, symbol: 'USDC' } }), /token is invalid/)
  await assert.rejects(repository.create({ ...stockRequest, kind: 'service_funding' }), /rail does not support/)
  await assert.rejects(productionRepository.create(request), /Durable payment execution storage is not configured/)
} finally {
  await rm(root, { recursive: true, force: true })
}

console.log('Pocket payment execution intent smoke tests passed.')
