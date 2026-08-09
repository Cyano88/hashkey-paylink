import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  CIRCLE_GAS_STATION_EVM_NETWORKS,
  requireCircleGasStationEvmWallet,
} from '../api/circle-evm-gas-station.ts'

const address = '0x1111111111111111111111111111111111111111'
const wallet = {
  id: 'wallet-1',
  address,
  blockchain: 'BASE',
  accountType: 'SCA',
  state: 'LIVE',
  scaCore: 'circle_6900_singleowner_v3',
}

assert.deepEqual(Object.keys(CIRCLE_GAS_STATION_EVM_NETWORKS), ['base', 'arbitrum', 'arc'])
assert.equal(CIRCLE_GAS_STATION_EVM_NETWORKS.base.blockchain, 'BASE')
assert.equal(CIRCLE_GAS_STATION_EVM_NETWORKS.arbitrum.blockchain, 'ARB')
assert.equal(CIRCLE_GAS_STATION_EVM_NETWORKS.arc.blockchain, 'ARC-TESTNET')

const verified = requireCircleGasStationEvmWallet({
  chain: 'base',
  walletId: wallet.id,
  walletAddress: address,
  wallets: [wallet],
})
assert.equal(verified.accountType, 'SCA')
assert.equal(verified.address, address)

for (const [candidate, status, message] of [
  [{ ...wallet, accountType: 'EOA' }, 409, /not eligible for EVM gas sponsorship/],
  [{ ...wallet, state: 'FROZEN' }, 409, /not active/],
  [{ ...wallet, blockchain: 'ARB' }, 403, /ownership could not be verified/],
  [{ ...wallet, id: 'wallet-2' }, 403, /ownership could not be verified/],
]) {
  assert.throws(
    () => requireCircleGasStationEvmWallet({
      chain: 'base',
      walletId: wallet.id,
      walletAddress: wallet.address,
      wallets: [candidate],
    }),
    error => error.status === status && message.test(error.message),
  )
}

const handlerSource = await readFile(new URL('../api/circle-solana-email.ts', import.meta.url), 'utf8')
assert.equal(
  [...handlerSource.matchAll(/\/v1\/w3s\/user\/transactions\/contractExecution/g)].length,
  1,
  'All Circle EVM contract executions must pass through the single Gas Station SCA boundary.',
)
assert.match(handlerSource, /async function createCircleGasStationEvmChallenge/)
assert.match(handlerSource, /requireCircleGasStationEvmWallet\(/)
assert.doesNotMatch(handlerSource, /BASE_GAS_RECOVERY_USDC|ARBITRUM_GAS_RECOVERY_USDC|ARC_GAS_RECOVERY_USDC/)

const passkeySource = await readFile(new URL('../src/lib/circlePasskeyPayment.ts', import.meta.url), 'utf8')
assert.match(passkeySource, /paymaster:\s*true/)
assert.doesNotMatch(passkeySource, /getSponsoredGasRecoveryUnits/)

const checkoutSource = await readFile(new URL('../src/pages/PaymentPage.tsx', import.meta.url), 'utf8')
assert.match(checkoutSource, /function circleEvmPaymentBreakdown/)
assert.match(checkoutSource, /circleEvmPaymentBreakdown\(totalUnits\)\.requiredUnits/)

console.log('Circle EVM Gas Station policy smoke tests passed.')
