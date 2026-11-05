import assert from 'node:assert/strict'
import {fixture,now} from './fixtures/cross-bridge.mjs'
import {validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
import {buildCrossBridgeChargedPlan} from '../api/pocket/cross-bridge-reimbursement.ts'
import {crossBridgeWalletFingerprint} from '../api/pocket/cross-bridge-wallets.ts'
import {createCrossBridgeReview} from '../api/pocket/cross-bridge-review.ts'
import {crossBridgeActivityRow} from '../api/pocket/cross-bridge-activity.ts'
import {crossBridgeResponse} from '../api/pocket/cross-bridge-runtime.ts'
import {CROSS_BRIDGE_NETWORKS} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {Keypair} from '@solana/web3.js'
process.env.POCKET_SWAP_QUOTE_SECRET='activity-outcome-regression-'.repeat(4)
const solTreasury=Keypair.fromSeed(new Uint8Array(32).fill(7)).publicKey.toBase58();let cases=0
for(const source of CROSS_BRIDGE_NETWORKS)for(const destination of CROSS_BRIDGE_NETWORKS){if(source===destination)continue
 const {q,i}=fixture(source,destination,'USDC','USDC'),route=validateCrossBridgeRelayQuote(q,i,now)
 const wallets={ownerId:'owner',source:{network:source,provider:['bsc','xlayer'].includes(source)?'privy':'circle',walletId:'source',address:i.sender},destination:{network:destination,provider:['bsc','xlayer'].includes(destination)?'privy':'circle',walletId:'dest',address:i.recipient}};wallets.fingerprint=crossBridgeWalletFingerprint(wallets)
 const recipient=source==='solana'?solTreasury:'0x3333333333333333333333333333333333333333',charged=await buildCrossBridgeChargedPlan(route,wallets,123n,recipient)
 const review=await createCrossBridgeReview({wallets,input:i,providerQuote:q,appFee:null,reimbursementUnits:123n,reimbursementRecipient:recipient,...charged,expiresAt:now+30000},{now})
 const base={id:review.quote.id,ownerId:'owner',quoteToken:review.quoteToken,state:'submitted',sourceHash:'source-hash',createdAt:now,updatedAt:Date.now()}
 assert.equal((await crossBridgeActivityRow(base)).paycrestStatus,'processing')
 for(const name of ['observedDelivery','delivery']){
  const proof={hash:'destination-hash',token:route.tokenOut,amountUnits:route.receiveUnits,observedAt:Date.now(),verifiedAt:Date.now()};const op={...base,[name]:proof};const saved=JSON.stringify(op)
  const row=await crossBridgeActivityRow(op),response=await crossBridgeResponse(op)
  assert.equal(row.paycrestStatus,'completed');assert.equal(row.bridgeSettlementPending,true);assert.equal(row.receivedAmount,response.amountOut);assert.equal(row.destinationAsset,'USDC');assert.equal(JSON.stringify(op),saved,'display must not publish financial settlement')
  assert.equal(response.status,'submitted','execution journal response remains recoverable')
  assert.equal((await crossBridgeActivityRow({...op,state:'source_failed'})).paycrestStatus,'failed')
 }
 cases++
}
console.log('PASS server Activity and status output for '+cases+' bridge directions: verified delivery completes display, exact received amount, unconfirmed stays processing, failure wins, journal untouched')
