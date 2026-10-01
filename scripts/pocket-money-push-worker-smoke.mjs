import assert from 'node:assert/strict'
import { runPocketMoneyPushWorker } from '../api/pocket/money-push-worker.ts'

const now = 2_000_000
const incomingHash = `0x${'1'.repeat(64)}`
const outgoingHash = `0x${'2'.repeat(64)}`
const internalHash = `0x${'3'.repeat(64)}`
const requestHash = `0x${'4'.repeat(64)}`
const bridgeHash = `0x${'5'.repeat(64)}`
const oldHash = `0x${'6'.repeat(64)}`
const acceptedHash = `0x${'7'.repeat(64)}`
const row = (overrides) => ({
  id: overrides.txHash,
  eventId: overrides.txHash,
  txHash: overrides.txHash,
  title: 'USDC moved',
  amount: '1',
  currency: 'USDC',
  chain: 'base',
  ts: now - 31_000,
  source: overrides.direction === 'in' ? 'wallet-deposit' : 'wallet-withdrawal',
  paycrestStatus: 'confirmed',
  direction: overrides.direction,
  ...overrides,
})
const pushes = []
const paidRequests = []
const result = await runPocketMoneyPushWorker({
  configured: () => true,
  readContext: async()=>[],
  listOwners: async () => ['owner-1'],
  readActivity: async () => [
    row({ txHash: incomingHash, direction: 'in', payer: '0xexternal' }),
    row({ txHash: outgoingHash, direction: 'out', recipient: '0xrecipient' }),
    row({ txHash: internalHash, direction: 'out', recipient: '0xownwallet' }),
    row({ txHash: requestHash, direction: 'out', recipient: '0xrequester' }),
    row({ txHash: bridgeHash, direction: 'out', recipient: '0xbridge' }),
    row({ txHash: oldHash, direction: 'in', payer: '0xold', ts: now - 11 * 60_000 }),
    row({ txHash: acceptedHash, direction: 'out', recipient: '0xrequester', amount: '3' }),
  ],
  readWallets: async () => [{ network: 'base', walletAddress: '0xownwallet' }],
  listActions: async () => [{ action: 'wallet.bridge', resourceId: bridgeHash, metadata: {}, ownerId: 'owner-1' }],
  listRequests: async () => [
    { id: 'paid-request', status: 'paid', transactionHash: requestHash },
    { id: 'accepted-request', status: 'accepted', recipientId: 'owner-1', senderId: 'requester-1', senderAddress: '0xrequester', amount: '3', updatedAt: now - 32_000 },
  ],
  markRequestPaid: async (ownerId, requestId, txHash) => {
    paidRequests.push({ ownerId, requestId, txHash })
    return { id: requestId, senderId: 'requester-1', recipientId: ownerId, amount: '3' }
  },
  sendPush: async (ownerId, eventId, input) => { pushes.push({ ownerId, eventId, input }) },
  now: () => now,
})

assert.deepEqual(result, { ok: true, owners: 1, notifications: 4, errors: 0 })
assert.deepEqual(paidRequests, [{ ownerId: 'owner-1', requestId: 'accepted-request', txHash: acceptedHash }])
assert.equal(pushes.length, 4)
assert.deepEqual(pushes.map(item => item.input.title).sort(), ['Request paid', 'Request paid', 'USDC received', 'USDC sent'])
assert.ok(pushes.every(item => item.input.path.startsWith('/activity')))
assert.ok(pushes.every(item => item.input.tag.startsWith('pocket-')))
assert.ok(pushes.some(item => item.eventId.includes(incomingHash)))
assert.ok(pushes.some(item => item.eventId.includes(outgoingHash)))
assert.equal(pushes.some(item => item.eventId.includes(acceptedHash)), false, 'accepted request transfer must not also produce a generic push')
const olderHash = `0x${'8'.repeat(64)}`
const olderPushes = []
const olderMarks = []
const olderResult = await runPocketMoneyPushWorker({
  configured: () => true,
  readContext: async()=>[],
  listOwners: async () => ['owner-old'],
  readActivity: async () => [],
  readWallets: async () => [{ network: 'base', walletAddress: '0xpayer' }],
  listActions: async () => [],
  listRequests: async () => [{ id: 'older-request', status: 'accepted', recipientId: 'owner-old', senderId: 'requester-old', senderAddress: '0x1111111111111111111111111111111111111111', amount: '2', network: 'base', updatedAt: now - 60 * 60_000 }],
  markRequestPaid: async (ownerId, requestId, txHash) => {
    olderMarks.push({ ownerId, requestId, txHash })
    return { id: requestId, senderId: 'requester-old', recipientId: ownerId, amount: '2' }
  },
  findEvm: async input => { assert.equal(input.exactAmount, true); assert.equal(input.lookbackBlocks, 43_200n); assert.equal(input.chunkSize, 3_600n); return { txHash: olderHash } },
  findSolana: async () => null,
  sendPush: async (ownerId, eventId, input) => { olderPushes.push({ ownerId, eventId, input }) },
  now: () => now,
})
assert.deepEqual(olderResult, { ok: true, owners: 1, notifications: 2, errors: 0 })
assert.deepEqual(olderMarks, [{ ownerId: 'owner-old', requestId: 'older-request', txHash: olderHash }])
assert.deepEqual(olderPushes.map(item => item.input.title).sort(), ['Request paid', 'Request paid'])
console.log('Pocket money push worker smoke tests passed: recent and older accepted payments reconcile to Paid while confirmed external sends and receipts notify without duplicates.')
const bankHash='0x'+'a'.repeat(64),billHash='0x'+'b'.repeat(64),refundHash='0x'+'c'.repeat(64),sourceHash='0x'+'d'.repeat(64),mintHash='0x'+'e'.repeat(64)
const scopedPushes=[]
const scoped=await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['scoped'],readWallets:async()=>[],listActions:async()=>[{action:'bank-withdraw.route',metadata:{txHash:sourceHash,destinationTxHash:mintHash}}],listRequests:async()=>[],readActivity:async()=>[
 row({txHash:bankHash,direction:'out',recipient:'bank'}),row({txHash:bankHash,eventId:'fee',direction:'out',recipient:'treasury',amount:'0.01'}),row({txHash:billHash,direction:'out',recipient:'bill'}),row({txHash:refundHash,direction:'in',payer:'bill'}),row({txHash:sourceHash,direction:'out',recipient:'bridge'}),row({txHash:mintHash,direction:'in',payer:'bridge'})],
 readContext:async()=>[
 {...row({txHash:bankHash,direction:'out'}),eventId:'bank-payment',source:'bank-withdraw',bankOrderId:'bank-order',accountName:'Fixture Name',bankName:'OPay',amountNgn:'1000',fiatCurrency:'NGN',bankSettlementStatus:'settled',ts:now-3600000,statusUpdatedAt:now-1000},
 {...row({txHash:billHash,direction:'out'}),eventId:'bill-payment',source:'bills',billCategory:'airtime',amountNgn:'200',paycrestStatus:'refunded',refundTxHash:refundHash},
 {...row({txHash:sourceHash,direction:'out'}),source:'wallet-bridge',fundingParent:'bank-withdraw:bank-order',paycrestStatus:'completed'}],
 sendPush:async(owner,eventId,input)=>{scopedPushes.push(input);return true},now:()=>now})
assert.equal(scoped.errors,0);assert.equal(scopedPushes.length,2)
assert.deepEqual(scopedPushes.map(n=>n.title).sort(),['Bank transfer successful','Refund completed'])
assert(scopedPushes.every(n=>n.path.includes('?receipt=')))
console.log('PASS scoped worker: delayed bank settlement notifies, bill refund notifies once, debit/fee/refund deposit/bridge legs remain silent')
const movePushes=[]
await runPocketMoneyPushWorker({configured:()=>true,listOwners:async()=>['moves'],readWallets:async()=>[],listActions:async()=>[],listRequests:async()=>[],readActivity:async()=>[row({txHash:sourceHash,direction:'out'}),row({txHash:mintHash,direction:'in'}),row({txHash:billHash,direction:'out'}),row({txHash:billHash,direction:'in'})],readContext:async()=>[
 {...row({txHash:sourceHash,direction:'out'}),source:'wallet-bridge',chain:'arc',destination:'base',destinationTxHash:mintHash,paycrestStatus:'completed'},
 {...row({txHash:billHash,direction:'out'}),source:'wallet-swap',chain:'arc',contextLabel:'1 USDC to 1 token',paycrestStatus:'completed'}],sendPush:async(owner,event,input)=>movePushes.push(input),now:()=>now})
assert.deepEqual(movePushes.map(n=>n.title).sort(),['Swap completed','USDC bridged'])
console.log('PASS standalone bridge and swap each send one scoped push; all underlying sends and receipts remain silent.')

const giftPushes=[],giftHash='0x'+'f'.repeat(64)
const giftDeps={configured:()=>true,listOwners:async()=>['gift-owner'],readWallets:async()=>[],listActions:async()=>[{action:'gift.sent',metadata:{txHash:giftHash}}],listRequests:async()=>[],readActivity:async()=>[row({txHash:giftHash,direction:'out',amount:'0.1',recipient:'escrow'}),row({txHash:giftHash,eventId:'gift-fee',direction:'out',amount:'0.00025',recipient:'treasury'})],readContext:async()=>[{...row({txHash:giftHash,direction:'out',amount:'0.1'}),eventId:'gift-parent',source:'gift',paycrestStatus:'completed',feeAmount:'0.00025'}],sendPush:async(owner,event,input)=>giftPushes.push(input),now:()=>now}
await runPocketMoneyPushWorker(giftDeps)
assert.equal(giftPushes.length,1);assert.equal(giftPushes[0].title,'Gift funded');assert.equal(giftPushes[0].body,'Your 0.1 USDC gift is ready to share.')
giftPushes.length=0;await runPocketMoneyPushWorker({...giftDeps,readContext:async()=>[]});assert.equal(giftPushes.length,0,'Gift action suppresses raw debit/fee even while context catches up')
const {EVM_PLATFORM_TREASURY}=await import('../src/lib/platformFees.ts')
console.log('PASS gift funding emits one scoped push; underlying principal and fee transfers stay silent even during context delay.')
const feePushes=[]
await runPocketMoneyPushWorker({...giftDeps,listActions:async()=>[],readContext:async()=>[],readActivity:async()=>[row({txHash:outgoingHash,payer:'0xpayer',direction:'out',recipient:'0xrecipient',amount:'1'}),row({txHash:outgoingHash,payer:'0xpayer',eventId:'ordinary-fee',direction:'out',recipient:EVM_PLATFORM_TREASURY,amount:'0.0025'})],sendPush:async(owner,event,input)=>feePushes.push(input)})
assert.equal(feePushes.length,1);assert.equal(feePushes[0].body,'1 USDC sent on Base.');assert(!JSON.stringify(feePushes).includes('0.0025'))
console.log('PASS normal USDC send emits one principal push and no platform-fee push.')
