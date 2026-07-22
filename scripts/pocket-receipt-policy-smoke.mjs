import assert from 'node:assert/strict'
import {
  pocketActivityReceipt,
  pocketActivityStatus,
  pocketReceiptAvailability,
  pocketReceiptKind,
} from '../src/pocket/lib/pocketReceipt.ts'
import { solanaUsdcTransferParties } from '../api/pocket/wallet-chain-activity.ts'

const base = {
  eventId: 'evt_1',
  txHash: `0x${'1'.repeat(64)}`,
  chain: 'base',
  payer: `0x${'2'.repeat(40)}`,
  memo: 'Pocket payment',
  amount: '10',
  ts: 1_750_000_000_000,
}

const incoming = { ...base, source: 'wallet-deposit', settlementType: 'wallet_transfer', paycrestStatus: 'confirmed', direction: 'in', recipient: 'Circle Pocket' }
assert.equal(pocketReceiptKind(incoming), 'money_in')
assert.equal(pocketReceiptAvailability(incoming), 'ready')
assert.equal(pocketActivityReceipt(incoming)?.title, 'USDC received')

const outgoing = { ...base, eventId: 'evt_2', source: 'wallet-withdrawal', settlementType: 'wallet_transfer', paycrestStatus: 'confirmed', direction: 'out', recipient: `0x${'3'.repeat(40)}` }
assert.equal(pocketReceiptKind(outgoing), 'money_out')
assert.equal(pocketActivityReceipt(outgoing)?.title, 'USDC sent')

const incompleteOutgoing = { ...outgoing, eventId: 'evt_incomplete', recipient: undefined }
assert.equal(pocketReceiptAvailability(incompleteOutgoing), 'none')
assert.equal(pocketActivityReceipt(incompleteOutgoing), null)

const solanaMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const solanaOwner = 'PocketOwner1111111111111111111111111111111'
const solanaSender = 'PayerWallet111111111111111111111111111111'
const solanaParties = solanaUsdcTransferParties(
  solanaOwner,
  [
    { mint: solanaMint, owner: solanaOwner, uiTokenAmount: { uiAmountString: '2' } },
    { mint: solanaMint, owner: solanaSender, uiTokenAmount: { uiAmountString: '20' } },
  ],
  [
    { mint: solanaMint, owner: solanaOwner, uiTokenAmount: { uiAmountString: '7' } },
    { mint: solanaMint, owner: solanaSender, uiTokenAmount: { uiAmountString: '15' } },
  ],
)
assert.equal(solanaParties.ownerDelta, 5)
assert.equal(solanaParties.counterparty, solanaSender)

const incompleteSolanaIncoming = { ...incoming, chain: 'solana', payer: 'Solana wallet' }
assert.equal(pocketReceiptAvailability(incompleteSolanaIncoming), 'none')

const bridge = { ...base, eventId: 'evt_3', source: 'wallet-bridge', settlementType: 'wallet_bridge', paycrestStatus: 'confirmed' }
assert.equal(pocketReceiptKind(bridge), null)
assert.equal(pocketReceiptAvailability(bridge), 'none')
assert.equal(pocketActivityReceipt(bridge), null)

const bankPending = { ...base, eventId: 'evt_4', source: 'bank-withdraw', settlementType: 'INSTANT_FIAT', paycrestStatus: 'processing', direction: 'out' }
assert.equal(pocketReceiptAvailability(bankPending), 'pending')
assert.equal(pocketActivityReceipt(bankPending), null)

const bankSettled = { ...bankPending, paycrestStatus: 'settled', bankName: 'Example Bank', bankLast4: '1234', accountName: 'Pocket User' }
assert.equal(pocketActivityReceipt(bankSettled)?.title, 'Bank payout')

const bill = { ...base, eventId: 'evt_5', source: 'bills', settlementType: 'bill_payment', paycrestStatus: 'delivered', billCategory: 'airtime', billProvider: 'Mobile provider', billTarget: '08000000000' }
assert.equal(pocketReceiptKind(bill), 'bill_purchase')
assert.equal(pocketActivityReceipt(bill)?.variant, 'bills')

const appPurchase = { ...base, eventId: 'evt_6', source: 'app-pay', settlementType: 'app_pay', paycrestStatus: 'completed', recipient: 'Research service' }
assert.equal(pocketReceiptKind(appPurchase), 'app_purchase')
assert.equal(pocketActivityReceipt(appPurchase)?.title, 'App Pay purchase')

const gatewayFunding = { ...base, eventId: 'evt_7', source: 'gateway-activation', settlementType: 'gateway_funding', paycrestStatus: 'completed' }
assert.equal(pocketReceiptKind(gatewayFunding), null)
assert.equal(pocketActivityReceipt(gatewayFunding), null)

const unknown = { ...outgoing, eventId: 'evt_8', paycrestStatus: undefined }
assert.equal(pocketActivityStatus(unknown), 'status unavailable')
assert.equal(pocketReceiptAvailability(unknown), 'none')

console.log('Pocket receipt policy smoke checks passed')
