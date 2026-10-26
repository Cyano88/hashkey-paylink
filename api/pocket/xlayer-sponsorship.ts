import {xLayerUsde,xLayerUsdg} from '../../src/pocket/lib/pocketXLayerPaymentAssets.js'
import {lifiRevenueMetadata} from './lifi-revenue-evidence.js'
import {readSponsoredSwapOutcome,type SponsoredSwapEvidence} from './xlayer-swap-settlement.js'
import {encodeXLayerSponsoredBatch} from './xlayer-sponsored-cost.js'
import {verifySponsoredSwap} from './xlayer-swap-sponsorship.js'
import {recordCirclePocketAction} from '../circle-pocket-action-journal.js'
import type { Request, Response } from 'express'
import { PrivyClient } from '@privy-io/server-auth'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { decodeFunctionData, encodeFunctionData, isAddress, parseAbi, zeroAddress, type Hex } from 'viem'
import { verifiedPrivyUser } from '../privy-circle-link.js'
import { hasRenderDurableStore, mutateDurableJson, readDurableJson } from '../render-durable-store.js'
import { makeSponsoredRequest, makeSponsoredBatchRequest, type SponsoredRequest } from '../../src/pocket/lib/pocketSponsoredRequest.js'
import {quoteXLayerReimbursement,openXLayerReimbursement,sealXLayerReimbursement,refreshXLayerReimbursement,type XLayerFeeEstimator,type XLayerReimbursementPolicy,type XLayerFeeQuote} from './xlayer-reimbursement.js'
import {configuredXLayerReimbursement} from './xlayer-fee-estimator.js'
import {checkXLayerBillingCoverage,type XLayerCoverage} from './xlayer-billing-guard.js'
import {createXLayerOutboundBridge,openOutboundBridge,sealOutboundBridge,outboundBridgePreview} from './xlayer-outbound-bridge.js'
import catalogue from '../../src/pocket/lib/pocketXStocksCatalog.json' with { type: 'json' }
import { stockClient, stockTokenAbi } from '../../src/pocket/lib/pocketXStocksWallet.js'
import { readStockMarketPrices } from './xstocks-prices.js'
import { assertSponsoredSendMinimum, isXLayerSendStablecoin } from '../../src/pocket/lib/pocketStockSendMinimum.js'
import { validateEarnSponsorship, preflightEarnSponsorship, type EarnIntent } from './earn-sponsorship.js'

const contracts = new Set([
  xLayerUsde.address.toLowerCase(),xLayerUsdg.address.toLowerCase(),
  '0xb6ceceab302e2e4948951ee7843fc24e92933061',
  '0x779ded0c9e1022225f8e0630b35a9b54be713736',
  ...catalogue.assets.map(a => a.address.toLowerCase()),
])
const transferAbi = parseAbi(['function transfer(address,uint256) returns(bool)'])
type Record = { swap?:SponsoredSwapEvidence; fingerprint: string; wallet: string; owner: string; at: number; hash?: string; transactionId?: string; userOperationHash?: string; bridgeQuoteToken?:string; coverage?:XLayerCoverage; providerFailure?: {status:number;code?:string;message?:string;cause?:string;requestId?:string} }
// Privy documents this exact 400 error as not broadcast. Other errors remain
// uncertain. Keep the durable reservation: a duplicate must never send again.
const notBroadcast = (record: Record) => !record.hash && !record.transactionId && !record.userOperationHash && record.providerFailure?.status === 400 && record.providerFailure?.code === 'transaction_broadcast_failure'
const rejected = (res: Response) => res.status(422).json({ok:false,code:'pocket_sponsor_not_submitted',error:'Transfer was not sent. The wallet provider could not broadcast it.'})
function diagnostic(value: unknown, secret: string) {
  if(typeof value !== 'string') return undefined
  return value.split(secret).join('[redacted]')
    .replace(/(?:Bearer|Basic)\s+\S+/gi,'[redacted]')
    .replace(/eyJ[A-Za-z0-9_.-]+/g,'[redacted]')
    .replace(/0x[0-9a-f]{64,}/gi,'[redacted]')
    .replace(/[\r\n\t]/g,' ').slice(0,500)
}
type Store = { requests: { [id: string]: Record } }
type Config = { appId: string; secret: string; enabled: boolean; wallets: string[]; publicTransfers?: boolean; earnEnabled?: boolean; outboundBridge?:boolean }
const configuration = (): Config => ({
  appId: process.env.PRIVY_APP_ID || process.env.VITE_PRIVY_APP_ID || '',
  secret: process.env.PRIVY_APP_SECRET || '',
  enabled: process.env.POCKET_XLAYER_SPONSORSHIP_ENABLED === 'true',
  publicTransfers: process.env.POCKET_XLAYER_TRANSFER_PUBLIC_ENABLED === 'true',
  outboundBridge: process.env.POCKET_XLAYER_OUTBOUND_BRIDGE_ENABLED === 'true',
  earnEnabled: process.env.POCKET_EARN_ENABLED === 'true',
  wallets: (process.env.POCKET_XLAYER_SPONSORSHIP_WALLETS || '').toLowerCase().split(',').map(s => s.trim()).filter(Boolean),
})
const loadUser = (id: string, c: Config) => new PrivyClient(c.appId, c.secret).getUserById(id)
const mutate = (fn: (current: Store | undefined) => Store) => mutateDurableJson<Store>('pocket:xlayer-sponsorship:v1', fn)
const read = () => readDurableJson<Store>('pocket:xlayer-sponsorship:v1')
const fail = (message: string, status = 400) => Object.assign(new Error(message), { status })
// Build stablecoin calls on the server. Client-supplied arbitrary batches never
// reach the estimator or sponsor. Ownership is established by the handler first.
function reimbursementTransfer(raw:any,ownerId:string,walletId:string,wallet:string,id:string,c:Config,now:number){
  const token=raw?.asset==='USDC'?'0xb6ceceab302e2e4948951ee7843fc24e92933061':raw?.asset==='USDT'?'0x779ded0c9e1022225f8e0630b35a9b54be713736':null
  if(!token||!isAddress(raw?.recipient)||typeof raw?.amountUnits!=='string'||! /^[1-9]\d{0,19}$/.test(raw.amountUnits)||BigInt(raw.amountUnits)>=2n**64n)throw fail('Invalid stablecoin transfer.')
  const data=encodeFunctionData({abi:transferAbi,functionName:'transfer',args:[raw.recipient,BigInt(raw.amountUnits)]})
  const request=makeSponsoredRequest({appId:c.appId,walletId,attemptId:id,expiresAt:now+30000,from:wallet,to:token,data})
  validateSponsoredRequest(request,walletId,c,now)
  return {binding:{ownerId,walletId,walletAddress:wallet as Hex,asset:raw.asset as 'USDC'|'USDT',amountUnits:raw.amountUnits as string,intentId:id},calls:[{to:token as Hex,data,value:'0x0' as const}],token,units:BigInt(raw.amountUnits)}
}
async function minimum(token:string,units:bigint) {
  if(isXLayerSendStablecoin(token)) return assertSponsoredSendMinimum(token,units,6)
  const address=token.toLowerCase() as `0x${string}`
  if(await stockClient.getChainId()!==196) throw Error('X Layer could not be verified.')
  const [decimals,prices]=await Promise.all([
    stockClient.readContract({address,abi:stockTokenAbi,functionName:'decimals'}),readStockMarketPrices([address]),
  ])
  assertSponsoredSendMinimum(token,units,Number(decimals),prices[address])
}
export function validateSponsoredRequest(request: SponsoredRequest, walletId: string, c: Config, now: number, earn?: EarnIntent) {
  const tx = request?.body?.params?.transaction
  const id = request?.headers?.['privy-idempotency-key']
  const expiry = Number(request?.headers?.['privy-request-expiry'])
  if (!/^[a-zA-Z0-9]{10,64}$/.test(walletId) || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id || '')) throw fail('Invalid payment reference.')
  if (!Number.isSafeInteger(expiry) || expiry <= now || expiry > now + 120_000) throw fail('Payment approval expired. Review the transfer again.')
  if (!tx || !isAddress(tx.from) || !isAddress(tx.to)) throw fail('Unsupported X Layer transaction.')
  if (earn) {
    if (!c.earnEnabled) throw fail('Earn is not available yet.', 403)
    try { validateEarnSponsorship(earn, tx) } catch { throw fail('Unsupported Earn transaction.') }
    const canonical = makeSponsoredRequest({appId:c.appId,walletId,attemptId:id,expiresAt:expiry,from:tx.from,to:tx.to,data:tx.data})
    if (!isDeepStrictEqual(request, canonical)) throw fail('Earn request does not match the supported transaction.')
    return { id, wallet: tx.from.toLowerCase(), canonical, token:tx.to, units:0n }
  }
  if (!contracts.has(tx.to.toLowerCase())) throw fail('Unsupported X Layer transfer.')
  if (!/^0xa9059cbb[0-9a-f]{128}$/i.test(tx.data)) throw fail('Only token transfers can be sponsored.')
  const { args } = decodeFunctionData({ abi: transferAbi, data: tx.data as `0x${string}` })
  if (args[1] <= 0n || args[0].toLowerCase() === tx.from.toLowerCase() || args[0].toLowerCase() === zeroAddress) throw fail('Invalid transfer recipient or amount.')
  if(isXLayerSendStablecoin(tx.to)) {
    try { assertSponsoredSendMinimum(tx.to,args[1],6) } catch(error) { throw fail((error as Error).message) }
  }
  const canonical = makeSponsoredRequest({appId:c.appId,walletId,attemptId:id,expiresAt:expiry,from:tx.from,to:tx.to,data:tx.data})
  // Reject added calls, delegate operations, native value, gas overrides, wrong
  // chains, attacker-controlled URLs and extra headers. Relay exactly what was signed.
  if (!isDeepStrictEqual(request, canonical)) throw fail('Payment request does not match the supported transfer.')
  return { id, wallet: tx.from.toLowerCase(), canonical, token:tx.to, units:args[1] }
}

export function createXLayerSponsorshipHandler(overrides: Partial<{
  identity: typeof verifiedPrivyUser; user: typeof loadUser; config: typeof configuration;
  mutate: typeof mutate; read: typeof read; minimum:typeof minimum; earnPreflight:typeof preflightEarnSponsorship; durable: () => boolean; fetch: typeof fetch; now: () => number;
  reimbursement: {estimate:XLayerFeeEstimator;pricing:XLayerReimbursementPolicy};
  outbound:ReturnType<typeof createXLayerOutboundBridge>;
  journal:typeof recordCirclePocketAction;
  billingGuard:typeof checkXLayerBillingCoverage;
}> = {}) {
  const d = { billingGuard:checkXLayerBillingCoverage, journal:recordCirclePocketAction, identity:verifiedPrivyUser, user:loadUser, config:configuration, mutate, read, minimum, earnPreflight:preflightEarnSponsorship, durable:hasRenderDurableStore, fetch, now:Date.now, reimbursement:configuredXLayerReimbursement(), outbound:createXLayerOutboundBridge(), ...overrides }
  async function resolveAccepted(id: string, record: Record, walletId: string, c: Config) {
    if (record.hash || !record.transactionId) return record.hash || null
    const response = await d.fetch(`https://api.privy.io/v1/transactions/${record.transactionId}`, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(10_000),
      headers:{'privy-app-id':c.appId,Authorization:'Basic '+Buffer.from(`${c.appId}:${c.secret}`).toString('base64')},
    })
    if (!response.ok) return null
    const tx = await response.json()
    // Bind recovery to the exact provider transaction, wallet and network.
    if (tx.id !== record.transactionId || tx.wallet_id !== walletId || tx.caip2 !== 'eip155:196') return null
    if (record.userOperationHash && tx.user_operation_hash && tx.user_operation_hash !== record.userOperationHash) return null
    if (typeof tx.transaction_hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(tx.transaction_hash)) return null
    await d.mutate(current => {
      const saved = current?.requests[id]
      if (!saved || saved.fingerprint !== record.fingerprint || saved.transactionId !== record.transactionId) throw Error('Payment recovery mismatch.')
      saved.hash = tx.transaction_hash
      return current!
    })
    // A hash is a reference, not payment success. The client checks the receipt.
    return tx.transaction_hash as string
  }
  async function journalOutbound(owner:string,token:string,hash:string|null,status:string,details:{cashReceivedAmount?:string;status?:string;destinationTxHash?:string;refundAsset?:string;refundNetwork?:string;refundAmount?:string}={}){
    const q=openOutboundBridge(token,owner),preview=outboundBridgePreview(q)
    return d.journal({ownerId:owner,idempotencyKey:'pocket:xlayer-bridge:'+q.fee.intentId,action:'wallet.xlayer-bridge',resourceId:q.fee.intentId,status:status==='completed'?'completed':['failed','refunded'].includes(status)?'failed':'submitted',metadata:{...(q.purpose?{purpose:q.purpose}:{}),...(status==='completed'&&details.cashReceivedAmount?{cashReceivedAmount:details.cashReceivedAmount}:{}),...lifiRevenueMetadata(q.lifi?.revenue,q.fee.networkFeeUnits),execution:'privy',quoteToken:token,source:'xlayer',destination:q.destination,destinationAddress:q.destinationAddress,amount:preview.amount,assetSymbol:q.fee.asset,walletAddress:q.fee.walletAddress,paymentState:status,...(hash?{txHash:hash}:{}),...(details.destinationTxHash?{destinationTxHash:details.destinationTxHash}:{}),...(status==='refunded'?{refundAsset:details.refundAsset!,refundNetwork:details.refundNetwork!,refundAmount:details.refundAmount!,refundTxHash:details.destinationTxHash!}:{})}})
  }
  async function reconcileOutbound(owner:string,token:string){
    const q=openOutboundBridge(token,owner),record=(await d.read())?.requests[q.fee.intentId]
    if(!record||record.owner!==owner||record.wallet!==q.fee.walletAddress.toLowerCase()||record.bridgeQuoteToken!==token)throw Error('Bridge recovery reference is unavailable.')
    let hash=await resolveAccepted(q.fee.intentId,record,q.fee.walletId,d.config()).catch(()=>null)
    // Recover older accepted batches whose response identifier was not saved.
    // Provider candidates are never trusted without the exact canonical deposit and fee proof.
    if(!hash&&!notBroadcast(record)){
      const recovered=await d.outbound.recoverSource(q).catch(()=>null)
      if(recovered){
        await d.mutate(current=>{
          const saved=current?.requests[q.fee.intentId]
          if(!saved||saved.fingerprint!==record.fingerprint||saved.bridgeQuoteToken!==token||saved.hash&&saved.hash!==recovered)throw Error('Bridge recovery mismatch.')
          saved.hash=recovered;return current!
        })
        hash=recovered
      }
    }
    const bridge=notBroadcast(record)?{status:'failed' as const}:hash?await d.outbound.status(q,hash as Hex):{status:'pending' as const}
    const saved=await journalOutbound(owner,token,hash,bridge.status,bridge)
    // The shared journal protects terminal outcomes against stale parallel checks.
    const meta=saved.metadata||{},status=saved.status==='completed'?'completed':saved.status==='failed'?(meta.paymentState==='refunded'?'refunded':'failed'):bridge.status
    const result={...bridge,status,...(status==='completed'&&meta.cashReceivedAmount?{cashReceivedAmount:meta.cashReceivedAmount}:{}),...(meta.destinationTxHash?{destinationTxHash:meta.destinationTxHash}:{}),...(status==='refunded'?{refundAsset:meta.refundAsset,refundNetwork:meta.refundNetwork,refundAmount:meta.refundAmount}:{})}
    return {ok:true,status,hash,txHash:hash,accepted:Boolean(record.transactionId||record.hash),bridge:result,quote:outboundBridgePreview(q)}
  }
  const handler = async (req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store')
    let reserved = false
    try {
      if (req.method !== 'POST') throw fail('Method not allowed.', 405)
      const identity = await d.identity(req)
      const c = d.config()
      if (!c.appId || !c.secret || !d.durable()) throw fail('Sponsored transfers are not available yet.', 503)
      const wallet = String(req.body?.wallet || '').toLowerCase()
      if (!isAddress(wallet)) throw fail('Invalid Pocket wallet.', 400)
      const user = await d.user(identity.userId, c)
      const linked = user.linkedAccounts.filter(a => a.type === 'wallet' && a.walletClientType === 'privy' && a.chainType === 'ethereum' && a.address.toLowerCase() === wallet)
      const embedded = linked[0] as { id?: string } | undefined
      if (linked.length !== 1 || !embedded?.id) throw fail('Your Pocket wallet could not be verified.', 403)
      if(req.body?.action==='bridge-capabilities'){
        const records=Object.values((await d.read())?.requests||{}).filter(r=>r.owner===identity.userId&&r.wallet===wallet&&r.bridgeQuoteToken)
        const pending=records.flatMap(r=>{try{const q=openOutboundBridge(r.bridgeQuoteToken!,identity.userId);return [{quote:outboundBridgePreview(q),quoteToken:r.bridgeQuoteToken,txHash:r.hash}]}catch{return []}})
        return res.json({ok:true,enabled:!!(c.enabled&&c.outboundBridge&&d.reimbursement&&(c.wallets.includes(wallet)||c.publicTransfers)),pending})
      }
      // Read-only recovery remains available even if sponsorship is disabled.
      if (req.body?.action === 'status') {
        const id = String(req.body?.attemptId || '')
        if (!/^[0-9a-f-]{36}$/i.test(id)) throw fail('Invalid payment reference.')
        const record = (await d.read())?.requests[id]
        if (!record) return res.json({ok:true,hash:null})
        if (record.owner !== identity.userId || record.wallet !== wallet) throw fail('Payment not found.', 404)
        if(record.bridgeQuoteToken)return res.json(await reconcileOutbound(identity.userId,record.bridgeQuoteToken))
        if (notBroadcast(record)) return rejected(res)
        const hash = await resolveAccepted(id,record,embedded.id,c).catch(() => null)
        const status=record.swap&&hash?await readSponsoredSwapOutcome(hash as Hex,record.swap).catch(()=>'pending' as const):undefined
        return res.json({ok:true,hash,accepted:Boolean(record.transactionId || record.hash),...(record.swap?{status:status||'pending'}:{})})
      }
      // Public token sends and explicitly enabled outbound bridges share the
      // verified wallet gate. Earn retains its separate existing pilot gate.
      if (!c.enabled || !(c.wallets.includes(wallet) || c.publicTransfers && (req.body?.purpose === undefined||req.body?.purpose==='bridge'||req.body?.purpose==='swap'))) throw fail('Sponsored transfers are not enabled for this wallet.', 403)
      if (req.body?.purpose !== undefined && !['earn','bridge','swap'].includes(req.body.purpose)) throw fail('Unsupported sponsorship purpose.')
      if(req.body?.purpose==='bridge'&&!c.outboundBridge)throw fail('Outbound bridging is not available yet.',403)
      if (req.body?.purpose === 'earn' && !c.earnEnabled) throw fail('Earn is not available yet.',403)
      if (req.body?.action === 'quote') {
        await d.billingGuard(wallet)
        if(req.body?.purpose==='bridge'){
          if(!d.reimbursement||!['base','arc','arbitrum','ethereum','polygon','solana'].includes(req.body.destination))throw fail('Outbound bridging is not available for this route.',503)
          const q=await d.outbound.quote({purpose:req.body.cashPurpose,ownerId:identity.userId,walletId:embedded.id,walletAddress:wallet as Hex,asset:req.body.asset,amount:String(req.body.amount||''),destination:req.body.destination},d.reimbursement.estimate,d.reimbursement.pricing)
          return res.json({ok:true,bridgeQuoteToken:sealOutboundBridge(q),quote:outboundBridgePreview(q),request:makeSponsoredBatchRequest({appId:c.appId,walletId:embedded.id,attemptId:q.fee.intentId,expiresAt:q.fee.expiresAt,calls:q.fee.calls})})
        }
        if(req.body?.purpose!==undefined||!d.reimbursement)throw fail('Reimbursed transfers are not available yet.',503)
        const transfer=reimbursementTransfer(req.body.intent,identity.userId,embedded.id,wallet,req.body.attemptId,c,d.now())
        const quote=await quoteXLayerReimbursement(transfer.binding,transfer.calls,d.now()+30000,d.reimbursement.estimate,d.reimbursement.pricing,d.now)
        return res.json({ok:true,quoteToken:sealXLayerReimbursement(quote),feeUnits:quote.networkFeeUnits,totalUnits:quote.totalUnits,expiresAt:quote.expiresAt,
          request:makeSponsoredBatchRequest({appId:c.appId,walletId:embedded.id,attemptId:quote.intentId,expiresAt:quote.expiresAt,calls:quote.calls})})
      }
      if (req.body?.action === 'prepare') return res.json({ok:true,appId:c.appId,walletId:embedded.id})
      if (req.body?.action !== 'send') throw fail('Unsupported sponsorship action.')
      const request = req.body?.request as SponsoredRequest
      // A malformed/expired replay must not claim an earlier request was unsent.
      const possibleId = request?.headers?.['privy-idempotency-key']
      if (typeof possibleId === 'string' && /^[0-9a-f-]{36}$/i.test(possibleId)) reserved = Boolean((await d.read())?.requests[possibleId])
      const earn = req.body?.purpose === 'earn' ? req.body?.intent as EarnIntent : undefined
      if (req.body?.purpose === 'earn' && !earn) throw fail('Earn intent is missing.')
      const signature = req.body?.signature
      if (typeof signature !== 'string' || !/^[A-Za-z0-9+/=]{32,512}$/.test(signature)) throw fail('Payment authorization is missing.')
      let swapEvidence:SponsoredSwapEvidence|undefined
      let approved:XLayerFeeQuote|undefined
      let validated:ReturnType<typeof validateSponsoredRequest>|{id:string;canonical:ReturnType<typeof makeSponsoredBatchRequest>;wallet:string;token:string;units:bigint}
      if(req.body?.purpose==='swap'){
        if(!d.reimbursement)throw fail('Swap fee service is temporarily unavailable.',503)
        const {q,fee}=await verifySponsoredSwap({routeToken:req.body.routeToken,feeToken:req.body.feeToken,ownerId:identity.userId,walletId:embedded.id,wallet},d.reimbursement.estimate,reserved)
        const canonical=makeSponsoredBatchRequest({appId:c.appId,walletId:embedded.id,attemptId:fee.intentId,expiresAt:fee.expiresAt,calls:fee.calls})
        if(possibleId!==fee.intentId||!isDeepStrictEqual(request,canonical))throw fail('Swap authorization changed.',422)
        validated={id:fee.intentId,canonical,wallet,token:q.tokenIn.address,units:BigInt(q.amountUnits)};approved=fee
        swapEvidence={callData:encodeXLayerSponsoredBatch(fee.calls),owner:wallet,input:q.tokenIn.address,output:q.tokenOut.address,inputUnits:q.amountUnits,minimumOutUnits:q.minimumOutUnits,feeUnits:fee.networkFeeUnits}
      }else if(req.body?.purpose==='bridge'){
        if(!d.reimbursement)throw fail('Outbound bridging is not available yet.',503)
        let q
        try{q=openOutboundBridge(req.body.bridgeQuoteToken,identity.userId)}catch{throw fail('Bridge quote changed. Review the bridge again.',422)}
        if(q.fee.walletId!==embedded.id||q.fee.walletAddress.toLowerCase()!==wallet||q.fee.intentId!==possibleId||q.fee.expiresAt<=d.now())throw fail('Bridge quote expired or wallet changed. Review it again.',422)
        const canonical=makeSponsoredBatchRequest({appId:c.appId,walletId:embedded.id,attemptId:q.fee.intentId,expiresAt:q.fee.expiresAt,calls:q.fee.calls})
        if(!isDeepStrictEqual(request,canonical))throw fail('Payment request does not match the approved bridge.')
        if(!reserved){try{await d.outbound.preflight(q,d.reimbursement.estimate)}catch{throw fail('Bridge quote changed or expired. Review the bridge again.',422)}}
        validated={id:q.fee.intentId,canonical,wallet,token:q.fee.calls[0].to,units:BigInt(q.fee.amountUnits)}
        approved=q.fee
      }else if(req.body?.quoteToken!==undefined){
        if(earn||!d.reimbursement)throw fail('Reimbursed transfers are not available yet.',503)
        const transfer=reimbursementTransfer(req.body.intent,identity.userId,embedded.id,wallet,possibleId,c,d.now())
        try {approved=openXLayerReimbursement(req.body.quoteToken,transfer.binding,transfer.calls,d.now())}catch{throw fail('Transfer quote changed or expired. Review the transfer again.',422)}
        const canonical=makeSponsoredBatchRequest({appId:c.appId,walletId:embedded.id,attemptId:approved.intentId,expiresAt:approved.expiresAt,calls:approved.calls})
        if(!isDeepStrictEqual(request,canonical))throw fail('Payment request does not match the approved transfer.')
        validated={id:approved.intentId,canonical,wallet,token:transfer.token,units:transfer.units}
        if(!reserved){
          try {await refreshXLayerReimbursement(approved,transfer.calls,d.reimbursement.estimate,d.now)}catch{throw fail('Transfer fee changed or expired. Review the transfer again.',422)}
        }
      }else{
        validated=validateSponsoredRequest(request, embedded.id, c, d.now(), earn)
        // Public stablecoin sends must not bypass reimbursement via the legacy
        // single-call route. Existing allowlisted pilot and Earn are separate.
        if(!earn&&(d.reimbursement||c.publicTransfers&&!c.wallets.includes(wallet))&&isXLayerSendStablecoin(validated.token))throw fail('Review the transfer fee before sending.',422)
      }
      const { id, canonical, wallet: from, token, units } = validated
      if (from !== wallet) throw fail('Payment wallet does not match your Pocket wallet.', 403)
      // Recheck stocks against a server-loaded price/precision before reserving
      // sponsor credit. Never accept a client-supplied USD value or price.
      if(!reserved) {
        if (earn) {
          try { await d.earnPreflight(earn, wallet as `0x${string}`) } catch { throw fail('Could not prepare this Earn transaction. Refresh your balance and try again.',422) }
        } else if(req.body?.purpose!=='bridge'&&req.body?.purpose!=='swap')try { await d.minimum(token,units) } catch(error) { throw fail((error as Error).message,422) }
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
      if(approved&&!reserved&&!isDeepStrictEqual(approved.pricing,d.reimbursement?.pricing))throw fail('Transfer fee policy changed. Review the transfer again.',422)
      if(!reserved)await d.billingGuard(wallet)
      if(!reserved&&Number(canonical.headers['privy-request-expiry'])<=d.now())throw fail('Payment approval expired. Review the transfer again.',422)
      let existing: Record | undefined
      await d.mutate(current => {
        const store = current || { requests:{} }
        existing = store.requests[id]
        if (existing) {
          if (existing.fingerprint !== fingerprint || existing.owner !== identity.userId) throw fail('Payment reference already used.', 409)
          return store
        }
        // Atomic durable reservation. Uncertain upstream outcomes remain reserved;
        // neither retries nor restarts can silently broadcast another transfer.
        const recent = Object.values(store.requests).filter(r => r.at > d.now() - 86_400_000)
        if (recent.length >= 50 || recent.filter(r => r.wallet === wallet || r.owner === identity.userId).length >= 10) throw fail('Sponsored transfer limit reached. Try again tomorrow.', 429)
        store.requests[id] = {...(swapEvidence?{swap:swapEvidence}:{}),fingerprint,wallet,owner:identity.userId,at:d.now(),...(approved?{coverage:{walletId:embedded.id!,asset:approved.asset,feeUnits:approved.networkFeeUnits}}:{}),...(req.body?.purpose==='bridge'?{bridgeQuoteToken:req.body.bridgeQuoteToken}:{})}
        return store
      })
      reserved = true
      if (existing?.hash) return res.json({ok:true,hash:existing.hash})
      if (existing && notBroadcast(existing)) return rejected(res)
      if (existing) return res.status(409).json({ok:false,error:'This transfer is already being checked. View Activity before retrying.',code:'sponsor_outcome_unknown'})
      if(req.body?.purpose==='bridge')await journalOutbound(identity.userId,req.body.bridgeQuoteToken,null,'pending')
      const upstream = await d.fetch(canonical.url, {
        method:'POST', redirect:'error', signal:AbortSignal.timeout(30_000),
        headers:{...canonical.headers,'Content-Type':'application/json','Authorization':'Basic '+Buffer.from(`${c.appId}:${c.secret}`).toString('base64'),'privy-authorization-signature':signature},
        body:JSON.stringify(canonical.body),
      })
      const result = await upstream.json()
      const hash = result?.data?.hash
      const transactionId = result?.data?.transaction_id
      const userOperationHash = result?.data?.user_operation_hash
      if (upstream.ok && !hash && result?.data?.caip2 === 'eip155:196' &&
          typeof transactionId === 'string' && /^[a-zA-Z0-9_-]{10,128}$/.test(transactionId) &&
          (userOperationHash == null || typeof userOperationHash === 'string' && /^0x[0-9a-f]{64}$/i.test(userOperationHash))) {
        let accepted: Record | undefined
        await d.mutate(current => {
          const record = current?.requests[id]
          if (!record || record.fingerprint !== fingerprint) throw Error('Payment reservation unavailable.')
          record.transactionId=transactionId
          if(userOperationHash)record.userOperationHash=userOperationHash
          accepted={...record}
          return current!
        })
        const resolved = await resolveAccepted(id,accepted!,embedded.id,c).catch(() => null)
        return res.status(resolved ? 200 : 202).json({ok:true,hash:resolved,accepted:true})
      }
      if (!upstream.ok || typeof hash !== 'string' || !/^0x[0-9a-f]{64}$/i.test(hash)) {
        const code = typeof result?.code === 'string' && /^[a-zA-Z_][a-zA-Z_0-9]{0,63}$/.test(result.code) ? result.code : undefined
        await d.mutate(current => {
          if (!current?.requests[id]) throw Error('Payment reservation unavailable.')
          const rawId=upstream.headers.get('x-request-id') || upstream.headers.get('x-privy-request-id')
          const requestId=rawId && /^[a-zA-Z0-9_-]{1,128}$/.test(rawId) ? rawId : undefined
          // Privy's ApiErrorType uses `error` for text and optional `cause`.
          // RPC-shaped responses may instead contain error.message.
          const message = typeof result?.error === 'string' ? result.error : result?.error?.message ?? result?.message
          current.requests[id].providerFailure = {status:upstream.status,code,message:diagnostic(message,c.secret),cause:diagnostic(result?.cause,c.secret),requestId}
          return current
        })
        if (upstream.status === 400 && code === 'transaction_broadcast_failure' && !hash) return rejected(res)
        // Never expose provider payloads/secrets or assume every HTTP error means
        // no broadcast. A provider failure needs reconciliation, not another send.
        return res.status(502).json({ok:false,error:'The wallet did not confirm this transfer. Check Activity before retrying.',code:'sponsor_outcome_unknown'})
      }
      await d.mutate(current => {
        if (!current?.requests[id] || current.requests[id].fingerprint !== fingerprint) throw Error('Payment reservation unavailable.')
        current.requests[id].hash = hash
        // Fast confirmations also carry billing/recovery identifiers. Retain
        // them even when the response already contains the transaction hash.
        if (typeof transactionId === 'string' && /^[a-zA-Z0-9_-]{10,128}$/.test(transactionId)) current.requests[id].transactionId = transactionId
        if (typeof userOperationHash === 'string' && /^0x[0-9a-f]{64}$/i.test(userOperationHash)) current.requests[id].userOperationHash = userOperationHash
        return current
      })
      return res.json({ok:true,hash})
    } catch (reason) {
      const error = reason as Error & { status?: number }
      return res.status(reserved ? 502 : error.status || 503).json({ok:false,
        code:reserved?'sponsor_outcome_unknown':'pocket_sponsor_not_submitted',
        error:reserved?'This transfer could not be confirmed. Check Activity before retrying.':error.status?error.message:req.body?.action==='quote'&&req.body?.purpose==='bridge'?'Could not refresh the bridge quote. Try again.':'Sponsored transfers are temporarily unavailable.',
      })
    }
  }
  return Object.assign(handler,{reconcileOutbound})
}
const handler=createXLayerSponsorshipHandler()
export const reconcileXLayerOutboundBridge=handler.reconcileOutbound
export default handler
