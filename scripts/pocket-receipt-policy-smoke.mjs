import assert from 'node:assert/strict'
import {
  pocketActivityReceipt,
  pocketActivityStatus,
  pocketReceiptAvailability,
  pocketReceiptKind,
} from '../src/pocket/lib/pocketReceipt.ts'
import { paymentReceiptBrand, paymentReceiptFileName, paymentReceiptView, paymentReceiptOutcome } from '../src/lib/paymentReceiptPdf.ts'
import { evmLogBlockRanges, evmTransferTouchesTopic, solanaUsdcTransferParties } from '../api/pocket/wallet-chain-activity.ts'

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
assert.equal(pocketActivityReceipt(incoming)?.title, 'Received')
assert.deepEqual(paymentReceiptBrand(pocketActivityReceipt(incoming)), { kind: 'pocket', name: 'Pocket', imageUrl: '' })
assert.match(paymentReceiptFileName(pocketActivityReceipt(incoming)), /^pocket-/)

const outgoing = { ...base, eventId: 'evt_2', source: 'wallet-withdrawal', settlementType: 'wallet_transfer', paycrestStatus: 'confirmed', direction: 'out', recipient: `0x${'3'.repeat(40)}` }
assert.equal(pocketReceiptKind(outgoing), 'money_out')
assert.equal(pocketActivityReceipt(outgoing)?.title, 'Sent')

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

assert.deepEqual(evmLogBlockRanges(105n, 25n, 10n, 12), [
  { fromBlock: '0x51', toBlock: '0x5a' },
  { fromBlock: '0x5b', toBlock: '0x64' },
  { fromBlock: '0x65', toBlock: '0x69' },
])
assert.deepEqual(evmLogBlockRanges(500n, 9_000n, 10n, 2), [
  { fromBlock: '0x1e1', toBlock: '0x1ea' },
  { fromBlock: '0x1eb', toBlock: '0x1f4' },
])
const walletTopic = `0x${'1'.repeat(64)}`
assert.equal(evmTransferTouchesTopic(['transfer', walletTopic, `0x${'2'.repeat(64)}`], walletTopic), true)
assert.equal(evmTransferTouchesTopic(['transfer', `0x${'2'.repeat(64)}`, walletTopic], walletTopic), true)
assert.equal(evmTransferTouchesTopic(['transfer', `0x${'2'.repeat(64)}`, `0x${'3'.repeat(64)}`], walletTopic), false)

const bridge = { ...base, eventId: 'evt_3', source: 'wallet-bridge', settlementType: 'wallet_bridge', paycrestStatus: 'confirmed' }
assert.equal(pocketReceiptKind(bridge), null)
assert.equal(pocketReceiptAvailability(bridge), 'none')
assert.equal(pocketActivityReceipt(bridge), null)

const bankPending = { ...base, eventId: 'evt_4', source: 'bank-withdraw', settlementType: 'INSTANT_FIAT', paycrestStatus: 'processing', direction: 'out' }
assert.equal(pocketReceiptAvailability(bankPending), 'pending')
assert.equal(pocketActivityReceipt(bankPending), null)
assert.equal(pocketActivityReceipt(bankPending, { allowPending: true })?.status, 'pending')

const bankDeposited = { ...bankPending, paycrestStatus: 'deposited' }
assert.equal(pocketActivityStatus(bankDeposited), 'pending')
assert.equal(pocketReceiptAvailability(bankDeposited), 'pending')
assert.equal(pocketActivityReceipt(bankDeposited, { allowPending: true })?.status, 'pending')
assert.equal(pocketActivityStatus({ ...bankPending, paycrestStatus: 'pending' }), 'pending')

const bankReversed = { ...bankPending, paycrestStatus: 'refunded' }
assert.equal(pocketActivityStatus(bankReversed), 'reversed')
assert.equal(pocketReceiptAvailability(bankReversed), 'ready')
assert.equal(pocketActivityReceipt(bankReversed)?.status, 'reversed')

const bankSettled = { ...bankPending, paycrestStatus: 'settled', bankName: 'Example Bank', bankLast4: '1234', accountName: 'Pocket User' }
assert.equal(pocketActivityReceipt(bankSettled)?.title, 'Bank transfer')

const bill = { ...base, eventId: 'evt_5', source: 'bills', settlementType: 'bill_payment', paycrestStatus: 'delivered', billCategory: 'airtime', billProvider: 'Mobile provider', billTarget: '08000000000' }
assert.equal(pocketReceiptKind(bill), 'bill_purchase')
assert.equal(pocketActivityReceipt(bill)?.variant, 'bills')

const electricityBill = { ...bill, eventId: 'evt_5_power', billCategory: 'electricity', billTarget: '1111111111111', billToken: 'Token : 26362054405982757802' }
const electricityReceipt = pocketActivityReceipt(electricityBill)
assert.equal(electricityReceipt?.billToken, electricityBill.billToken)
assert.deepEqual(paymentReceiptView(electricityReceipt).rows.at(-1), { label: 'Meter Token', value: '26362054405982757802', mono: true })

const appPurchase = { ...base, eventId: 'evt_6', source: 'app-pay', settlementType: 'app_pay', paycrestStatus: 'completed', recipient: 'Research service' }
assert.equal(pocketReceiptKind(appPurchase), 'app_purchase')
assert.equal(pocketActivityReceipt(appPurchase)?.title, 'Payment')

const partnerReceipt = {
  ...pocketActivityReceipt(appPurchase),
  brandName: 'Partner Platform',
  brandImageUrl: 'https://partner.example/brand.png',
  brandKind: 'partner',
}
assert.deepEqual(paymentReceiptBrand(partnerReceipt), {
  kind: 'partner',
  name: 'Partner Platform',
  imageUrl: 'https://partner.example/brand.png',
})
assert.match(paymentReceiptFileName(partnerReceipt), /^hashpaylink-/)

const gatewayFunding = { ...base, eventId: 'evt_7', source: 'gateway-activation', settlementType: 'gateway_funding', paycrestStatus: 'completed' }
assert.equal(pocketReceiptKind(gatewayFunding), null)
assert.equal(pocketActivityReceipt(gatewayFunding), null)

const unknown = { ...outgoing, eventId: 'evt_8', paycrestStatus: undefined }
assert.equal(pocketActivityStatus(unknown), 'status unavailable')
assert.equal(pocketReceiptAvailability(unknown), 'none')

console.log('Pocket receipt policy smoke checks passed')

for (const status of ['pending', 'processing', 'refund available', 'refund pending', 'refunding', 'unknown']) assert.equal(paymentReceiptOutcome({status}).label, 'Processing')
assert.equal(paymentReceiptOutcome({status:'refunded'}).label,'Reversed')
assert.equal(paymentReceiptOutcome({status:'failed'}).label,'Failed')
assert.equal(paymentReceiptOutcome({status:'confirmed'}).label,'Successful')

for (const status of ['failed','rejected','cancelled']) {
 const row={...bankPending,paycrestStatus:status}
 assert.equal(pocketActivityStatus(row),'failed')
 assert.equal(pocketActivityReceipt(row,{allowPending:true})?.status,'failed')
}
for (const status of ['pending','deposited','fulfilling','fulfilled','validated','settling']) assert.equal(pocketActivityStatus({...bankPending,paycrestStatus:status}),'pending')
assert.equal(pocketActivityStatus({...bankPending,paycrestStatus:'settled'}),'successful')

assert.equal(pocketActivityStatus({...bankPending,paycrestStatus:''}),'payout incomplete')
assert.equal(pocketActivityStatus({...bankPending,paycrestStatus:'expired'}),'payout incomplete')
assert.equal(paymentReceiptOutcome({status:'needs review'}).label,'Processing')

for (const status of ['submitted','processing','failed','confirmed']) {
 const stock={...incoming,eventId:'stock-'+status,chain:'xlayer',assetSymbol:'NVDAx',amount:'0.01',paycrestStatus:status}
 const receipt=pocketActivityReceipt(stock,{allowPending:true})
 assert.equal(receipt.asset,'NVDAx');assert.equal(receipt.amount,'0.01');assert.equal(receipt.title,'Received')
 assert.equal(paymentReceiptOutcome(receipt).state,status==='confirmed'?'successful':status==='failed'?'failed':'pending')
}
const incomingXPay={...incoming,source:'xpay',chain:'xlayer',assetSymbol:'NVDAx'}
assert.equal(pocketReceiptKind(incomingXPay),'money_in')
assert.equal(pocketActivityReceipt(incomingXPay).title,'Received')
assert.equal(pocketActivityReceipt({...outgoing,source:'request',paycrestStatus:'submitted'},{allowPending:true}).title,'Request payment')
assert.equal(paymentReceiptOutcome(pocketActivityReceipt({...outgoing,source:'request',paycrestStatus:'submitted'},{allowPending:true})).state,'pending')
console.log('PASS: XStocks incoming assets, XPay direction, request submission and all receipt status mappings')
for (const [chain,label] of [['base','Base'],['ethereum','Ethereum'],['polygon','Polygon'],['xlayer','X Layer']]) {
 const view=paymentReceiptView(pocketActivityReceipt({...incoming,chain,assetSymbol:'NVDAx'}))
 assert.equal(view.rows.find(r=>r.label==='Network').value,label)
 assert.equal(view.rows.find(r=>r.label==='Type').value,'Received')
}
console.log('PASS: Base, Ethereum, Polygon and X Layer receipts preserve network and movement type')
