import { fetchAndVerifyArcAgreementOperatorWallet } from '../../api/arc-agreement-operator-wallet.ts'
import { getAddress, isAddress } from 'viem'

const DEFAULT_TIMEOUT_MS = 10_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function requiredValue(value, name) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${name} is required.`)
  return normalized
}

function preflightTimeout(value) {
  if (value === undefined || value === null || String(value).trim() === '') return DEFAULT_TIMEOUT_MS
  const timeoutMs = Number(value)
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000) {
    throw new Error('ARC_AGREEMENT_OPERATOR_PREFLIGHT_TIMEOUT_MS must be an integer from 1000 to 30000.')
  }
  return timeoutMs
}

function testApiKey(value) {
  const apiKey = requiredValue(value, 'CIRCLE_TEST_API_KEY')
  if (apiKey.length < 16) throw new Error('CIRCLE_TEST_API_KEY is invalid.')
  return apiKey
}

function operatorWalletId(value) {
  const walletId = requiredValue(value, 'ARC_AGREEMENT_OPERATOR_WALLET_ID')
  if (!UUID.test(walletId)) throw new Error('ARC_AGREEMENT_OPERATOR_WALLET_ID is invalid.')
  return walletId
}

function operatorAddress(value) {
  const address = requiredValue(value, 'ARC_AGREEMENT_OPERATOR_ADDRESS')
  if (!isAddress(address) || /^0x0{40}$/i.test(address)) {
    throw new Error('ARC_AGREEMENT_OPERATOR_ADDRESS is invalid.')
  }
  return getAddress(address)
}

function maskedWalletId(walletId) {
  return `${walletId.slice(0, 8)}...${walletId.slice(-4)}`
}

export function arcAgreementOperatorPreflightConfig(env = process.env) {
  return Object.freeze({
    apiKey: testApiKey(env.CIRCLE_TEST_API_KEY),
    walletId: operatorWalletId(env.ARC_AGREEMENT_OPERATOR_WALLET_ID),
    expectedOperator: operatorAddress(env.ARC_AGREEMENT_OPERATOR_ADDRESS),
    timeoutMs: preflightTimeout(env.ARC_AGREEMENT_OPERATOR_PREFLIGHT_TIMEOUT_MS),
  })
}

export async function runArcAgreementOperatorPreflight({
  env = process.env,
  fetchImpl,
  requestId,
} = {}) {
  const config = arcAgreementOperatorPreflightConfig(env)
  const verified = await fetchAndVerifyArcAgreementOperatorWallet({
    ...config,
    requestId: requiredValue(requestId, 'Circle wallet preflight request id'),
    fetchImpl,
  })

  return Object.freeze({
    ok: true,
    walletId: maskedWalletId(verified.walletId),
    operatorAddress: verified.address,
    network: verified.blockchain,
    custodyType: verified.custodyType,
    state: verified.state,
    accountType: verified.accountType,
  })
}
