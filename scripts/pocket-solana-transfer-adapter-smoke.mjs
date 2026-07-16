import assert from 'node:assert/strict'
import bs58 from 'bs58'
import { Keypair, Transaction, SystemProgram } from '@solana/web3.js'
import {
  createPocketSolanaTransferPrepareHandler,
  createPocketSolanaTransferSubmitHandler,
} from '../api/pocket/solana-transfers.ts'
import { validatePocketSignedSolanaTransaction } from '../api/relay-solana.ts'
import {
  preparePocketSolanaTransfer,
  submitPocketSolanaTransfer,
} from '../src/pocket/api/pocketSolanaTransferClient.ts'

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
}

async function request(handler, method, body = undefined, headers = {}) {
  const res = responseRecorder()
  await handler({ method, body, headers }, res)
  return res
}

const linkedWallet = Keypair.generate()
const recipient = Keypair.generate().publicKey.toBase58()
const rawPreparedTransaction = Buffer.from('prepared-transaction').toString('base64')
const signedTransaction = Buffer.from('signed-transaction').toString('base64')
const buildCalls = []
const relayCalls = []
const validateCalls = []
const dependencies = {
  verifyUser: async req => {
    if (req.headers.authorization !== 'Bearer privy-secret') {
      throw Object.assign(new Error('Missing Privy access token.'), { status: 401 })
    }
    return { userId: 'privy-user-1', email: 'ada@example.com' }
  },
  readLink: async key => {
    assert.equal(key, 'privy-user-1:solana')
    return {
      privyUserId: 'privy-user-1',
      chain: 'solana',
      purpose: 'payment',
      circleWalletId: 'circle-solana-wallet',
      circleWalletAddress: linkedWallet.publicKey.toBase58(),
      circleBlockchain: 'SOL',
      updatedAt: 1,
    }
  },
  build: async (req, res) => {
    buildCalls.push(req.body)
    res.json({ ok: true, tx: rawPreparedTransaction, lastValidBlockHeight: 12345 })
  },
  relay: async (req, res) => {
    relayCalls.push(req.body)
    res.json({ ok: true, txHash: 'solana-signature', status: 'confirmed' })
  },
  validateSigned: input => { validateCalls.push(input) },
}
const prepareHandler = createPocketSolanaTransferPrepareHandler(dependencies)
const submitHandler = createPocketSolanaTransferSubmitHandler(dependencies)

const unauthorizedPrepare = await request(prepareHandler, 'POST', { recipient, amount: '1' })
assert.equal(unauthorizedPrepare.statusCode, 401)
assert.equal(unauthorizedPrepare.body.error.code, 'AUTH_REQUIRED')
assert.equal(buildCalls.length, 0)

const invalidPrepare = await request(prepareHandler, 'POST', { recipient: '', amount: '1' }, {
  authorization: 'Bearer privy-secret',
})
assert.equal(invalidPrepare.statusCode, 400)

const prepared = await request(prepareHandler, 'POST', { recipient, amount: '1.25' }, {
  authorization: 'Bearer privy-secret',
})
assert.equal(prepared.statusCode, 200)
assert.deepEqual(prepared.body, {
  ok: true,
  transaction: rawPreparedTransaction,
  lastValidBlockHeight: 12345,
})
assert.deepEqual(buildCalls[0], {
  from: linkedWallet.publicKey.toBase58(),
  to: recipient,
  amount: '1.25',
  mode: 'withdraw',
})

const submitted = await request(submitHandler, 'POST', {
  transaction: signedTransaction,
  lastValidBlockHeight: 12345,
}, { authorization: 'Bearer privy-secret' })
assert.equal(submitted.statusCode, 200)
assert.deepEqual(submitted.body, { ok: true, txHash: 'solana-signature', status: 'confirmed' })
assert.deepEqual(validateCalls[0], {
  tx: signedTransaction,
  requiredSigner: linkedWallet.publicKey.toBase58(),
})
assert.deepEqual(relayCalls[0], { tx: signedTransaction, lastValidBlockHeight: 12345 })

const missingWalletHandler = createPocketSolanaTransferPrepareHandler({
  ...dependencies,
  readLink: async () => null,
})
const missingWallet = await request(missingWalletHandler, 'POST', { recipient, amount: '1' }, {
  authorization: 'Bearer privy-secret',
})
assert.equal(missingWallet.statusCode, 404)
assert.equal(missingWallet.body.error.code, 'RESOURCE_NOT_FOUND')

const fetchCalls = []
const clientPrepared = await preparePocketSolanaTransfer({
  accessToken: 'client-token',
  recipient,
  amount: '1.25',
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, json: async () => prepared.body }
  },
})
assert.deepEqual(clientPrepared, { transaction: rawPreparedTransaction, lastValidBlockHeight: 12345 })
assert.equal(fetchCalls[0].url, '/api/pocket/transfers/prepare')
assert.equal(fetchCalls[0].init.headers.authorization, 'Bearer client-token')
assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { recipient, amount: '1.25' })

const clientSubmitted = await submitPocketSolanaTransfer({
  accessToken: 'client-token',
  transaction: signedTransaction,
  lastValidBlockHeight: 12345,
  fetcher: async (url, init) => {
    fetchCalls.push({ url, init })
    return { ok: true, json: async () => submitted.body }
  },
})
assert.deepEqual(clientSubmitted, { txHash: 'solana-signature', status: 'confirmed' })
assert.equal(fetchCalls[1].url, '/api/pocket/transfers/submit')
assert.equal(fetchCalls[1].init.headers.authorization, 'Bearer client-token')

const originalRelayer = process.env.RELAYER_PRIVATE_KEY_SOLANA
try {
  const relayer = Keypair.generate()
  process.env.RELAYER_PRIVATE_KEY_SOLANA = bs58.encode(relayer.secretKey)
  const approved = new Transaction({ feePayer: relayer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() })
    .add(SystemProgram.transfer({ fromPubkey: linkedWallet.publicKey, toPubkey: relayer.publicKey, lamports: 1 }))
  approved.partialSign(relayer, linkedWallet)
  const approvedBase64 = approved.serialize().toString('base64')
  assert.doesNotThrow(() => validatePocketSignedSolanaTransaction({
    tx: approvedBase64,
    requiredSigner: linkedWallet.publicKey.toBase58(),
  }))

  assert.throws(() => validatePocketSignedSolanaTransaction({
    tx: approvedBase64,
    requiredSigner: Keypair.generate().publicKey.toBase58(),
  }), /not approved by the linked wallet/)

  const wrongFeePayer = Keypair.generate()
  const wrongFeeTx = new Transaction({ feePayer: wrongFeePayer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() })
    .add(SystemProgram.transfer({ fromPubkey: linkedWallet.publicKey, toPubkey: relayer.publicKey, lamports: 1 }))
  wrongFeeTx.partialSign(wrongFeePayer, linkedWallet)
  assert.throws(() => validatePocketSignedSolanaTransaction({
    tx: wrongFeeTx.serialize().toString('base64'),
    requiredSigner: linkedWallet.publicKey.toBase58(),
  }), /invalid fee payer/)
} finally {
  if (originalRelayer === undefined) delete process.env.RELAYER_PRIVATE_KEY_SOLANA
  else process.env.RELAYER_PRIVATE_KEY_SOLANA = originalRelayer
}

console.log('Circle Pocket Solana transfer adapter smoke tests passed.')
