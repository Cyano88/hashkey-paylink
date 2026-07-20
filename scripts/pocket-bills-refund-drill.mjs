import process from 'node:process'
import dotenv from 'dotenv'
import { isAddress } from 'viem'

dotenv.config({ path: '.env.local', quiet: true })
dotenv.config({ quiet: true })

const TX_PATTERN = /^0x[a-fA-F0-9]{64}$/
const txHash = String(process.argv.find(value => value.startsWith('--tx=')) || '').slice(5).trim().toLowerCase()
const apply = process.argv.includes('--apply')

function stop(message) {
  console.error(message)
  process.exitCode = 1
}

if (!TX_PATTERN.test(txHash)) {
  stop('Provide the exact Base payment hash with --tx=0x...')
} else {
  const [{ readVtpassPhase0Config }, { readCircleTreasuryConfig }, { readDurableJson }, { createPocketBillsStore }, { verifyEvmUsdcTransfer }] = await Promise.all([
    import('../api/vtpass-config.ts'),
    import('../api/circle-developer-treasury.ts'),
    import('../api/render-durable-store.ts'),
    import('../api/pocket/bills-store.ts'),
    import('../api/usdc-transfer-verify.ts'),
  ])

  const config = readVtpassPhase0Config()
  const circle = readCircleTreasuryConfig()
  if (config.environment !== 'sandbox') stop('Refund drill is blocked outside VTpass sandbox.')
  else if (!config.refundsReady || !config.circleTreasuryReady) stop('Circle Bills refunds are not fully enabled.')
  else if (!isAddress(config.treasuryAddress) || config.treasuryAddress.toLowerCase() !== circle.treasuryAddress.toLowerCase()) {
    stop('Bills and Circle treasury addresses do not match.')
  } else {
    const data = await readDurableJson(config.storeKey)
    const intents = Object.values(data?.intents || {}).filter(intent => intent?.txHash?.toLowerCase() === txHash)
    if (intents.length !== 1) stop(intents.length ? 'Payment hash is connected to multiple Bills records.' : 'Payment hash was not found in the durable Bills store.')
    else {
      const intent = intents[0]
      let paymentAmountUsdc = intent.paymentAmountUsdc
      let paymentAmountSource = paymentAmountUsdc ? 'persisted' : ''
      if (!paymentAmountUsdc) {
        const verified = await verifyEvmUsdcTransfer({
          chain: 'base',
          txHash: intent.txHash,
          payer: intent.payerWallet,
          recipient: intent.treasuryAddress,
          minAmount: intent.amountUsdc,
        })
        paymentAmountUsdc = verified.amount
        paymentAmountSource = 'onchain'
      }
      const checks = {
        sandboxReceipt: intent.providerEnvironment === 'sandbox',
        officialTestNumber: intent.phone === '08011111111',
        delivered: intent.state === 'delivered',
        basePayment: intent.network === 'base',
        configuredTreasury: intent.treasuryAddress.toLowerCase() === config.treasuryAddress.toLowerCase(),
        exactPaymentAmount: Boolean(paymentAmountUsdc),
      }
      const eligible = Object.values(checks).every(Boolean)

      if (!eligible) {
        console.error(JSON.stringify({
          eligible: false,
          checks,
          receipt: {
            state: intent.state,
            providerEnvironment: intent.providerEnvironment,
            phone: intent.phone,
            network: intent.network,
            treasuryAddress: intent.treasuryAddress,
            configuredTreasuryAddress: config.treasuryAddress,
            paymentAmountUsdc: paymentAmountUsdc || '',
            paymentAmountSource,
          },
        }, null, 2))
        stop('Payment is not an eligible delivered VTpass sandbox receipt on the configured Circle treasury.')
      }
      else if (!apply) {
        console.log(JSON.stringify({
          ready: true,
          apply: false,
          intentId: intent.id,
          state: intent.state,
          amountNgn: intent.amountNgn,
          paymentAmountUsdc,
          paymentAmountSource,
          txHash: intent.txHash,
          message: 'Audit passed. Re-run with --apply to create the refund-pending drill state.',
        }, null, 2))
      } else {
        const store = createPocketBillsStore({ config })
        if (!intent.paymentAmountUsdc) {
          await store.backfillVerifiedPaymentAmount({
            ownerId: intent.ownerId,
            intentId: intent.id,
            txHash: intent.txHash,
            paymentAmountUsdc,
          })
        }
        const updated = await store.recordProviderResult(intent.ownerId, intent.id, {
          status: 'reversed',
          providerCode: 'REFUND_DRILL',
          providerStatus: 'reversed',
          responseDescription: 'Controlled VTpass sandbox refund drill.',
          requestId: intent.requestId,
          transactionId: intent.providerTransactionId,
          productName: intent.serviceName,
          recipient: intent.phone,
          amountNgn: Number(intent.amountNgn),
          purchasedCode: '',
          retryable: false,
          requeryRequired: false,
        }, { requery: true })
        console.log(JSON.stringify({
          ready: true,
          apply: true,
          intentId: updated.id,
          state: updated.state,
          paymentAmountUsdc: updated.paymentAmountUsdc,
          txHash: updated.txHash,
          message: 'Sandbox receipt has verified refund eligibility. The owner can now claim it from Bills activity.',
        }, null, 2))
      }
    }
  }
}
