import assert from 'node:assert/strict'
import {cashBridgePurpose} from '../src/pocket/lib/pocketCashBridgePurpose.ts'
import {sealBscOutbound,openBscOutbound,bscOutboundPreview} from '../api/pocket/bsc-outbound-bridge-quote.ts'
import {randomUUID} from 'node:crypto'
assert.deepEqual(cashBridgePurpose(undefined,'arbitrum'),{})
assert.throws(()=>cashBridgePurpose('cash','arbitrum'))
assert.throws(()=>cashBridgePurpose('unknown','base'))
const now=Date.now(),secret='synthetic-quote-secret-for-cash-tests-only'
const q={purpose:'cash',version:1,id:randomUUID(),ownerId:'owner',walletId:'fixturewallet123',walletAddress:'0x'+'1'.repeat(40),destinationAddress:'0x'+'2'.repeat(40),source:'bsc',destination:'base',asset:'USDC',from:'USDC',amountUnits:'1000000000000000000',totalInputUnits:'1001000000000000000',reimbursementUnits:'1000000000000000',receiveUnits:'990000',minimumOutUnits:'990000',orderId:'0x'+'a'.repeat(64),requestId:'0x'+'b'.repeat(64),issuedAt:now,expiresAt:now+30000}
const token=sealBscOutbound(q,secret)
assert.equal(openBscOutbound(token,'owner',secret).purpose,'cash')
assert.equal(bscOutboundPreview(q).purpose,'cash')
const [body,mac]=token.split('.');const changed=JSON.parse(Buffer.from(body,'base64url').toString());delete changed.purpose
assert.throws(()=>openBscOutbound(Buffer.from(JSON.stringify(changed)).toString('base64url')+'.'+mac,'owner',secret))
assert.throws(()=>sealBscOutbound({...q,purpose:'wrong'},secret))
console.log('PASS Cash intent is sealed, owner bound and Base only; ordinary bridges remain untagged')
