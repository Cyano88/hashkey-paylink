import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Keypair } from '@solana/web3.js'
import { requireCircleSolanaGasStationWallet } from '../api/circle-solana-gas-station.ts'

const address = Keypair.generate().publicKey.toBase58()
const wallet = { id: 'solana-wallet-1', address, blockchain: 'SOL', accountType: 'EOA', state: 'LIVE' }

const verified = requireCircleSolanaGasStationWallet({ walletId: wallet.id, walletAddress: wallet.address, wallets: [wallet] })
assert.equal(verified.address, address)
assert.equal(verified.accountType, 'EOA')

for (const [candidate, status, message] of [
  [{ ...wallet, accountType: 'SCA' }, 409, /not eligible for Solana Gas Station sponsorship/],
  [{ ...wallet, state: 'FROZEN' }, 409, /not active/],
  [{ ...wallet, blockchain: 'BASE' }, 403, /ownership could not be verified/],
  [{ ...wallet, id: 'different-wallet' }, 403, /ownership could not be verified/],
]) {
  assert.throws(
    () => requireCircleSolanaGasStationWallet({ walletId: wallet.id, walletAddress: wallet.address, wallets: [candidate] }),
    error => error.status === status && message.test(error.message),
  )
}

const handlerSource = await readFile(new URL('../api/circle-solana-email.ts', import.meta.url), 'utf8')
assert.match(handlerSource, /action === 'executeSolanaTransfer'/)
assert.match(handlerSource, /\/v1\/w3s\/user\/transactions\/transfer/)
assert.match(handlerSource, /requireCircleSolanaGasStationWallet\(/)
assert.match(handlerSource, /tokenAddress: SOLANA_USDC_MINT/)
assert.match(handlerSource, /blockchain: 'SOL'/)

const controllerSource = await readFile(new URL('../src/pocket/controllers/usePocketWithdrawalController.ts', import.meta.url), 'utf8')
assert.match(controllerSource, /sendCircleSolanaTransfer\(/)
assert.doesNotMatch(controllerSource, /preparePocketSolanaTransfer|submitPocketSolanaTransfer|signCircleSolanaTransaction/)

const bridgeSource = await readFile(new URL('../src/pocket/lib/pocketSolanaBridge.ts', import.meta.url), 'utf8')
assert.match(bridgeSource, /signCircleSolanaTransaction/)
assert.match(bridgeSource, /error\?: string \| \{ message\?: string \}/)
assert.match(bridgeSource, /pocketBridgeApiErrorMessage\(submitted\.error/)

const serverSource = await readFile(new URL('../server.ts', import.meta.url), 'utf8')
assert.match(serverSource, /bridge\/solana\/prepare', relayLimiter/)
assert.match(serverSource, /bridge\/solana\/submit', relayLimiter/)

console.log('Circle Solana Gas Station normal-transfer smoke tests passed.')
