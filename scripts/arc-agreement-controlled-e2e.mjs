import { randomUUID } from 'node:crypto'
import {
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
} from 'viem'
import { arcTestnet } from 'viem/chains'
import { encryptCircleEntitySecret } from '../api/circle-developer-treasury.ts'
import {
  arcAgreementClientReference,
  arcAgreementTerms,
} from '../api/arc-agreement-terms.ts'
import {
  prepareArcAgreementDeployment,
  reconcileArcAgreementSnapshot,
} from '../api/arc-agreement-reconciliation.ts'
import { readConfirmedArcAgreementSnapshot } from '../api/arc-agreement-confirmed-snapshot.ts'
import { fetchAndVerifyArcAgreementOperatorWallet } from '../api/arc-agreement-operator-wallet.ts'
import {
  prepareArcAgreementCancellationCall,
  prepareArcAgreementReleaseCall,
} from '../api/arc-agreement-operator.ts'
import { fetchAndVerifyArcAgreementOperatorTransaction } from '../api/arc-agreement-operator-status.ts'
import {
  drainArcAgreementWebhookOutbox,
  reconcileAndQueueArcAgreementWebhook,
} from '../api/arc-agreement-webhooks.ts'

const CONFIRM_FLAG = '--confirm-controlled-arc-testnet-lifecycle'
const FACTORY = getAddress('0xe828795f52b3d6902b982ab7266aaae404d7cea5')
const USDC = getAddress('0x3600000000000000000000000000000000000000')
const EXPECTED_OPERATOR = getAddress('0xd55d6ba98eABeCeCD24C84e715b13157ee4fCb49')
const PARTNER_ID = 'dev_arce2e20260729'
const AGREEMENT_ID = 'agr_arce2e20260729controlled'
const AMOUNT = '0.2'
const AMOUNT_UNITS = 200_000n
const SCHEDULE = [5_000, 10_000]
const DURATION_SECONDS = 7_200
const CANCELLATION_WINDOW_SECONDS = 3_600
const CIRCLE_BASE = 'https://api.circle.com'
const SUCCESS_STATES = new Set(['CONFIRMED', 'COMPLETE', 'CLEARED'])
const FAILURE_STATES = new Set(['CANCELLED', 'DENIED', 'FAILED', 'STUCK'])
const TX_HASH = /^0x[0-9a-f]{64}$/i
const IDS = Object.freeze({
  walletSet: '27f76937-3c2d-48ad-b6a9-38ff5bd54b07',
  wallets: 'fd074491-726b-4d23-bcec-2e6ac601b5dd',
  funding: '6e0dfd2e-6815-47d0-9b4c-6f1490060fe2',
  approval: '855582db-a8de-4600-b0f0-61535809d273',
  create: '2657851a-ba88-4136-b8a0-f73d963d583f',
  release: '3fcea3d2-8cf1-48a3-bb42-27ffa5033b73',
  cancel: '72e76537-14a3-4579-b5d2-fbee8f7993cc',
})

const erc20Abi = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
])
const factoryAbi = parseAbi([
  'function agreementEscrow(bytes32 agreementId) view returns (address)',
  'function createAndFund((bytes32 clientReference,bytes32 termsHash,address recipient,uint8 template,uint256 totalAmount,uint64 cancelUntil,uint64 expiresAt,uint16[] cumulativeReleaseBps) params) returns (address)',
])

function progress(stage, detail = '') {
  const suffix = detail ? ` — ${detail}` : ''
  console.log(`[arc-agreement-e2e] ${stage}${suffix}`)
}

function required(name) {
  const value = String(process.env[name] ?? '').trim()
  if (!value) throw new Error(`${name} is required.`)
  return value
}

function assertSafetyBoundary() {
  if (!process.argv.includes(CONFIRM_FLAG)) {
    throw new Error(`Refusing to execute without ${CONFIRM_FLAG}.`)
  }
  if (String(process.env.ARC_AGREEMENT_CONTROLLED_TEST_ENABLED).toLowerCase() !== 'true') {
    throw new Error('ARC_AGREEMENT_CONTROLLED_TEST_ENABLED=true is required.')
  }
  if (String(process.env.ARC_AGREEMENTS_ENABLED).toLowerCase() === 'true') {
    throw new Error('Public Arc Agreements activation must remain disabled during this test.')
  }
  if (getAddress(required('ARC_AGREEMENT_FACTORY_ADDRESS')) !== FACTORY) {
    throw new Error('ARC_AGREEMENT_FACTORY_ADDRESS does not match the reviewed factory.')
  }
  if (getAddress(required('ARC_AGREEMENT_OPERATOR_ADDRESS')) !== EXPECTED_OPERATOR) {
    throw new Error('ARC_AGREEMENT_OPERATOR_ADDRESS does not match the reviewed immutable operator.')
  }
  const key = required('CIRCLE_TEST_API_KEY')
  if (!key.startsWith('TEST_API_KEY:')) throw new Error('A Circle test API key is required.')
  return {
    apiKey: key,
    entitySecret: required('CIRCLE_ENTITY_SECRET'),
    operatorWalletId: required('ARC_AGREEMENT_OPERATOR_WALLET_ID'),
    rpcUrl: String(process.env.PRIVATE_RPC_URL_ARC ?? 'https://rpc.testnet.arc.network').trim(),
  }
}

function safeProviderMessage(body) {
  const code = String(body?.code ?? '').slice(0, 80)
  const message = String(body?.message ?? '').replace(/\s+/g, ' ').slice(0, 300)
  const errors = Array.isArray(body?.errors)
    ? body.errors.map(item => String(item?.message ?? item)).join('; ').slice(0, 500)
    : ''
  return [code, message, errors].filter(Boolean).join(': ')
}

function createCircleClient(config) {
  async function request(path, init = {}) {
    const response = await fetch(`${CIRCLE_BASE}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
        'content-type': 'application/json',
        'x-request-id': randomUUID(),
        ...init.headers,
      },
      signal: AbortSignal.timeout(30_000),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      throw new Error(`Circle ${path} failed with HTTP ${response.status}: ${safeProviderMessage(body)}`)
    }
    return body
  }

  async function ciphertext() {
    const body = await request('/v1/w3s/config/entity/publicKey', { method: 'GET' })
    return encryptCircleEntitySecret(config.entitySecret, body?.data?.publicKey)
  }

  async function mutate(path, payload) {
    return request(path, {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        entitySecretCiphertext: await ciphertext(),
      }),
    })
  }

  async function transaction(id) {
    return request(`/v1/w3s/transactions/${encodeURIComponent(id)}?txType=OUTBOUND`, { method: 'GET' })
  }

  async function waitForTransaction(id, label, options = {}) {
    const timeoutMs = options.timeoutMs ?? 600_000
    const requireHash = options.requireHash ?? false
    const deadline = Date.now() + timeoutMs
    let previousState = ''
    let reportedMissingHash = false
    while (Date.now() < deadline) {
      const body = await transaction(id)
      const tx = body?.data?.transaction
      const state = String(tx?.state ?? '')
      if (state !== previousState) {
        progress(label, `Circle state ${state || 'UNKNOWN'}`)
        previousState = state
      }
      if (SUCCESS_STATES.has(state)) {
        if (!requireHash || TX_HASH.test(String(tx?.txHash ?? ''))) return tx
        if (!reportedMissingHash) {
          progress(label, 'Circle confirmed; waiting for transaction hash')
          reportedMissingHash = true
        }
      }
      if (FAILURE_STATES.has(state)) {
        throw new Error(`${label} failed in Circle state ${state}: ${String(tx?.errorReason ?? tx?.errorDetails ?? '')}`)
      }
      await new Promise(resolve => setTimeout(resolve, 5_000))
    }
    throw new Error(`${label} did not confirm within ${Math.floor(timeoutMs / 1000)} seconds.`)
  }

  return { request, mutate, transaction, waitForTransaction }
}

async function waitForConfirmedState(publicClient, label, predicate, confirmations = 5, timeoutMs = 180_000) {
  progress(`Waiting for ${label}`, 'authoritative Arc state')
  const deadline = Date.now() + timeoutMs
  let observedAt
  while (Date.now() < deadline) {
    if (await predicate()) {
      observedAt = await publicClient.getBlockNumber()
      break
    }
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  if (observedAt === undefined) throw new Error(`${label} was not observed on Arc before timeout.`)
  while (await publicClient.getBlockNumber() < observedAt + BigInt(confirmations)) {
    await new Promise(resolve => setTimeout(resolve, 1_000))
  }
  progress(`${label} confirmed`, `${confirmations} additional blocks`)
}

async function circleContractExecution(circle, input) {
  const body = await circle.mutate('/v1/w3s/developer/transactions/contractExecution', {
    idempotencyKey: input.idempotencyKey,
    walletId: input.walletId,
    blockchain: 'ARC-TESTNET',
    contractAddress: input.contractAddress,
    feeLevel: 'MEDIUM',
    refId: input.refId,
    ...(input.callData
      ? { callData: input.callData }
      : {
          abiFunctionSignature: input.abiFunctionSignature,
          abiParameters: input.abiParameters.map(String),
        }),
  })
  const id = String(body?.data?.id ?? '')
  if (!id) throw new Error('Circle did not return a contract-execution transaction id.')
  return id
}

function createMemoryWebhookDependencies() {
  let store
  let clock = new Date()
  let deliveryAttempts = 0
  return {
    dependencies: {
      hasStore: () => true,
      mutate: async (_key, update) => {
        store = update(store)
        return store
      },
      notify: async () => {
        deliveryAttempts += 1
        return deliveryAttempts === 1
          ? { status: 'skipped', reason: 'controlled_retry_probe' }
          : { status: 'sent' }
      },
      now: () => new Date(clock),
    },
    advance: milliseconds => { clock = new Date(clock.getTime() + milliseconds) },
    snapshot: () => ({ store, deliveryAttempts }),
  }
}

async function main() {
  progress('Starting guarded lifecycle')
  const config = assertSafetyBoundary()
  const circle = createCircleClient(config)
  const publicClient = createPublicClient({
    chain: { ...arcTestnet, id: 5_042_002, name: 'Arc Testnet' },
    transport: http(config.rpcUrl, { timeout: 30_000, retryCount: 2 }),
  })
  if (await publicClient.getChainId() !== 5_042_002) throw new Error('RPC is not Arc Testnet.')
  const code = await publicClient.getBytecode({ address: FACTORY })
  if (!code || code === '0x') throw new Error('Reviewed factory bytecode is unavailable.')
  progress('Safety preflight passed', 'public activation disabled')

  const operatorWallet = await fetchAndVerifyArcAgreementOperatorWallet({
    apiKey: config.apiKey,
    walletId: config.operatorWalletId,
    expectedOperator: EXPECTED_OPERATOR,
    requestId: randomUUID(),
  })
  progress('Operator ownership verified')

  progress('Loading isolated test wallet set')
  const walletSetResponse = await circle.mutate('/v1/w3s/developer/walletSets', {
    idempotencyKey: IDS.walletSet,
    name: 'Hash PayLink Arc Agreement Controlled Test',
  })
  const walletSetId = String(walletSetResponse?.data?.walletSet?.id ?? '')
  if (!walletSetId) throw new Error('Circle did not return the controlled-test wallet set.')

  progress('Loading isolated payer and recipient wallets')
  const walletsResponse = await circle.mutate('/v1/w3s/developer/wallets', {
    idempotencyKey: IDS.wallets,
    blockchains: ['ARC-TESTNET'],
    walletSetId,
    accountType: 'EOA',
    count: 2,
    metadata: [
      { name: 'Arc Agreement Test Payer', refId: 'arc-agreement-controlled-payer' },
      { name: 'Arc Agreement Test Recipient', refId: 'arc-agreement-controlled-recipient' },
    ],
  })
  const wallets = walletsResponse?.data?.wallets ?? []
  if (wallets.length !== 2) throw new Error('Circle did not return two isolated test wallets.')
  const payer = wallets.find(item => item?.refId === 'arc-agreement-controlled-payer') ?? wallets[0]
  const recipient = wallets.find(item => item?.refId === 'arc-agreement-controlled-recipient') ?? wallets[1]
  const payerAddress = getAddress(payer.address)
  const recipientAddress = getAddress(recipient.address)
  progress('Isolated wallets ready')

  const clientReference = arcAgreementClientReference(PARTNER_ID, AGREEMENT_ID)
  const onchainAgreementId = await publicClient.readContract({
    address: FACTORY,
    abi: parseAbi(['function agreementIdFor(address payer,bytes32 clientReference) view returns (bytes32)']),
    functionName: 'agreementIdFor',
    args: [payerAddress, clientReference],
  })
  let escrow = await publicClient.readContract({
    address: FACTORY,
    abi: factoryAbi,
    functionName: 'agreementEscrow',
    args: [onchainAgreementId],
  })

  if (escrow === '0x0000000000000000000000000000000000000000') {
    progress('Funding controlled payer', '0.5 test USDC')
    const fundingResponse = await circle.mutate('/v1/w3s/developer/transactions/transfer', {
      idempotencyKey: IDS.funding,
      destinationAddress: payerAddress,
      amounts: ['0.5'],
      feeLevel: 'MEDIUM',
      refId: 'arc-agreement-controlled-payer-funding',
      tokenAddress: USDC,
      blockchain: 'ARC-TESTNET',
      walletAddress: EXPECTED_OPERATOR,
    })
    const fundingTx = await circle.waitForTransaction(fundingResponse?.data?.id, 'payer funding')
    await waitForConfirmedState(publicClient, 'payer funding', async () => {
      const balance = await publicClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [payerAddress],
      })
      return balance >= AMOUNT_UNITS
    })

    progress('Approving reviewed factory', '0.2 test USDC ceiling')
    const approvalId = await circleContractExecution(circle, {
      idempotencyKey: IDS.approval,
      walletId: payer.id,
      contractAddress: USDC,
      refId: 'arc-agreement-controlled-approval',
      callData: encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [FACTORY, AMOUNT_UNITS],
      }),
    })
    const approvalTx = await circle.waitForTransaction(approvalId, 'payer approval')
    await waitForConfirmedState(publicClient, 'factory approval', async () => {
      const allowance = await publicClient.readContract({
        address: USDC,
        abi: erc20Abi,
        functionName: 'allowance',
        args: [payerAddress, FACTORY],
      })
      return allowance >= AMOUNT_UNITS
    })

    progress('Creating and atomically funding agreement', '0.2 test USDC')
    const activationTimestamp = Math.floor(Date.now() / 1000)
    const terms = arcAgreementTerms({
      template: 'progressive_release',
      resourceId: AGREEMENT_ID,
      title: 'Controlled Arc Testnet agreement',
      description: 'Bounded lifecycle validation for the reviewed Hash PayLink factory.',
      amount: AMOUNT,
      recipient: recipientAddress,
      checkpoints: [{ percentage: 50 }, { percentage: 100 }],
      durationSeconds: DURATION_SECONDS,
      cancellationWindowSeconds: CANCELLATION_WINDOW_SECONDS,
    })
    const prepared = prepareArcAgreementDeployment({
      draft: {
        clientReference,
        termsHash: terms.termsHash,
        chainTerms: {
          templateCode: terms.templateCode,
          amountUsdcUnits: terms.amountUsdcUnits,
          recipient: recipientAddress,
          cumulativeReleaseBps: terms.cumulativeReleaseBps,
          durationSeconds: terms.durationSeconds,
          cancellationWindowSeconds: terms.cancellationWindowSeconds,
        },
      },
      payer: payerAddress,
      factory: FACTORY,
      operator: EXPECTED_OPERATOR,
      usdc: USDC,
      activationTimestamp,
    })
    const createId = await circleContractExecution(circle, {
      idempotencyKey: IDS.create,
      walletId: payer.id,
      contractAddress: FACTORY,
      refId: 'arc-agreement-controlled-create',
      callData: encodeFunctionData({
        abi: factoryAbi,
        functionName: 'createAndFund',
        args: [{
          clientReference: prepared.clientReference,
          termsHash: prepared.termsHash,
          recipient: prepared.recipient,
          template: prepared.templateCode,
          totalAmount: prepared.totalAmount,
          cancelUntil: prepared.cancelUntil,
          expiresAt: prepared.expiresAt,
          cumulativeReleaseBps: prepared.cumulativeReleaseBps,
        }],
      }),
    })
    const createTx = await circle.waitForTransaction(createId, 'agreement creation')
    await waitForConfirmedState(publicClient, 'agreement creation', async () => {
      escrow = await publicClient.readContract({
        address: FACTORY,
        abi: factoryAbi,
        functionName: 'agreementEscrow',
        args: [onchainAgreementId],
      })
      return escrow !== '0x0000000000000000000000000000000000000000'
    })
    progress('Agreement escrow created')
  } else {
    progress('Resuming existing controlled agreement')
  }

  if (escrow === '0x0000000000000000000000000000000000000000') {
    throw new Error('Factory did not bind the controlled agreement to an escrow.')
  }

  const initialConfirmed = await readConfirmedArcAgreementSnapshot(publicClient, escrow, 5)
  const initialSnapshot = initialConfirmed.snapshot
  const reconstructedActivation = Number(initialSnapshot.cancelUntil) - CANCELLATION_WINDOW_SECONDS
  const prepared = prepareArcAgreementDeployment({
    draft: {
      clientReference,
      termsHash: initialSnapshot.termsHash,
      chainTerms: {
        templateCode: initialSnapshot.templateCode,
        amountUsdcUnits: initialSnapshot.totalAmount.toString(),
        recipient: initialSnapshot.recipient,
        cumulativeReleaseBps: [...initialSnapshot.cumulativeReleaseBps],
        durationSeconds: Number(initialSnapshot.expiresAt) - reconstructedActivation,
        cancellationWindowSeconds: CANCELLATION_WINDOW_SECONDS,
      },
    },
    payer: initialSnapshot.payer,
    factory: FACTORY,
    operator: EXPECTED_OPERATOR,
    usdc: USDC,
    activationTimestamp: reconstructedActivation,
  })
  const initialReconciliation = reconcileArcAgreementSnapshot(prepared, initialSnapshot)
  if (!initialReconciliation.verified) {
    throw new Error(`Initial agreement reconciliation failed: ${initialReconciliation.mismatches.join(', ')}`)
  }
  progress('Initial chain reconciliation passed', initialReconciliation.lifecycle)

  let releaseTxHash = null
  let releasedConfirmed = initialConfirmed
  if (initialSnapshot.status === 1 && initialSnapshot.nextStep === 0) {
    progress('Releasing first agreement step', '0.1 test USDC')
    const releaseCall = prepareArcAgreementReleaseCall({
      operatorWallet,
      idempotencyKey: IDS.release,
      partnerId: PARTNER_ID,
      agreementId: AGREEMENT_ID,
      prepared,
      confirmed: initialConfirmed,
      step: 0,
      evidenceHash: '0x2cc44de1ec9df898b7f38ea3f19bc4a38571e126f06d4de761f5d90f7e1fc890',
    })
    const releaseId = await circleContractExecution(circle, releaseCall)
    const releaseTx = await circle.waitForTransaction(releaseId, 'operator release', { requireHash: true })
    await fetchAndVerifyArcAgreementOperatorTransaction({
      apiKey: config.apiKey,
      transactionId: releaseId,
      requestId: randomUUID(),
      preparedCall: releaseCall,
    })
    await waitForConfirmedState(publicClient, 'first release', async () => {
      const snapshot = await readConfirmedArcAgreementSnapshot(publicClient, escrow, 1)
      return snapshot.snapshot.status === 1 && snapshot.snapshot.nextStep === 1
    })
    releaseTxHash = releaseTx.txHash
    releasedConfirmed = await readConfirmedArcAgreementSnapshot(publicClient, escrow, 5)
  }
  const releasedReconciliation = reconcileArcAgreementSnapshot(prepared, releasedConfirmed.snapshot)
  if (!releasedReconciliation.verified || (
    releasedConfirmed.snapshot.status === 1
    && releasedConfirmed.snapshot.nextStep !== 1
  )) {
    throw new Error(`Released agreement reconciliation failed: ${releasedReconciliation.mismatches.join(', ')}`)
  }
  progress('Release reconciliation passed', releasedReconciliation.lifecycle)

  let cancelTxHash = null
  if (releasedConfirmed.snapshot.status === 1) {
    progress('Cancelling unreleased remainder', 'returning 0.1 test USDC')
    const cancelCall = prepareArcAgreementCancellationCall({
      operatorWallet,
      idempotencyKey: IDS.cancel,
      partnerId: PARTNER_ID,
      agreementId: AGREEMENT_ID,
      prepared,
      confirmed: releasedConfirmed,
      reasonHash: '0xdbf0d5c4516ab44ae411573f6e4d7c7404706b6fe8ea9b963a4a042c130e2f91',
    })
    const cancelId = await circleContractExecution(circle, cancelCall)
    const cancelTx = await circle.waitForTransaction(cancelId, 'operator cancellation', { requireHash: true })
    await fetchAndVerifyArcAgreementOperatorTransaction({
      apiKey: config.apiKey,
      transactionId: cancelId,
      requestId: randomUUID(),
      preparedCall: cancelCall,
    })
    await waitForConfirmedState(publicClient, 'operator cancellation', async () => {
      const snapshot = await readConfirmedArcAgreementSnapshot(publicClient, escrow, 1)
      return snapshot.snapshot.status === 3
    })
    cancelTxHash = cancelTx.txHash
  }

  const finalConfirmed = await readConfirmedArcAgreementSnapshot(publicClient, escrow, 5)
  const finalReconciliation = reconcileArcAgreementSnapshot(prepared, finalConfirmed.snapshot)
  if (!finalReconciliation.verified || finalConfirmed.snapshot.status !== 3) {
    throw new Error(`Final agreement reconciliation failed: ${finalReconciliation.mismatches.join(', ')}`)
  }
  progress('Final chain reconciliation passed', finalReconciliation.lifecycle)

  progress('Testing webhook replay and retry recovery')
  const memoryWebhook = createMemoryWebhookDependencies()
  const queued = await reconcileAndQueueArcAgreementWebhook({
    client: publicClient,
    partnerId: PARTNER_ID,
    agreementId: AGREEMENT_ID,
    prepared,
    escrow,
    confirmationBlocks: 5,
  }, memoryWebhook.dependencies)
  const replay = await reconcileAndQueueArcAgreementWebhook({
    client: publicClient,
    partnerId: PARTNER_ID,
    agreementId: AGREEMENT_ID,
    prepared,
    escrow,
    confirmationBlocks: 5,
  }, memoryWebhook.dependencies)
  if (queued.replayed || !replay.replayed) throw new Error('Webhook stable-event idempotency failed.')
  await drainArcAgreementWebhookOutbox(memoryWebhook.dependencies, 1)
  memoryWebhook.advance(31_000)
  const delivered = await drainArcAgreementWebhookOutbox(memoryWebhook.dependencies, 1)
  const webhookState = memoryWebhook.snapshot()
  const event = webhookState.store?.events?.[queued.event.id]
  if (delivered !== 1 || event?.status !== 'delivered' || webhookState.deliveryAttempts !== 2) {
    throw new Error('Webhook retry and recovery validation failed.')
  }
  progress('Webhook replay and retry recovery passed')

  const payerBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [payerAddress],
  })
  const recipientBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [recipientAddress],
  })
  console.log(JSON.stringify({
    ok: true,
    publicActivationEnabled: false,
    network: 'ARC-TESTNET',
    factory: FACTORY,
    agreementId: AGREEMENT_ID,
    onchainAgreementId,
    escrow,
    payer: { walletId: payer.id, address: payerAddress, balanceUsdcUnits: payerBalance.toString() },
    recipient: { walletId: recipient.id, address: recipientAddress, balanceUsdcUnits: recipientBalance.toString() },
    lifecycle: {
      initial: initialReconciliation.lifecycle,
      afterRelease: releasedReconciliation.lifecycle,
      final: finalReconciliation.lifecycle,
      releasedUsdcUnits: finalConfirmed.snapshot.releasedAmount.toString(),
      returnedUsdcUnits: (AMOUNT_UNITS - finalConfirmed.snapshot.releasedAmount).toString(),
    },
    transactions: {
      release: releaseTxHash,
      cancel: cancelTxHash,
    },
    webhook: {
      eventId: queued.event.id,
      replayed: replay.replayed,
      attempts: event.attempts,
      status: event.status,
    },
  }, null, 2))
}

main().catch(error => {
  console.error(`Controlled Arc Agreement test failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
})
