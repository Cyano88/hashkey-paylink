import { SHARE_CUSTODY_POLICY, type StockCustody } from '../../src/lib/xstocksAgreement/protocol.js'
import { keccak256, stringToHex, getAddress, isAddress } from 'viem'
import { parseWorkPayment, prepareWorkBinding, type WorkTermsForBinding } from './work.js'

import { parseTradeDetails, tradeText as text } from '../trade-agreement/terms.js'
export type { TradeDetails } from '../trade-agreement/terms.js'
function fail(message: string): never { throw Object.assign(Error(message), { status: 400 }) }
export function parseTradeCheckout(body: Record<string, unknown>, env: NodeJS.ProcessEnv): WorkTermsForBinding {
  if ((body.paymentRail !== undefined && body.paymentRail !== 'xlayer') || (body.chainId !== undefined && body.chainId !== 196)) fail('Stock Trade requires XLayer.');
  const { trade, amount } = parseTradeDetails(body)
  const payment = parseWorkPayment({ paymentRail:'xlayer', paymentToken:body.paymentToken, reviewHours:trade.inspectionHours }, amount, trade.dispatchDays*86400, env)!
  if(env.HASHPAYLINK_XSTOCKS_SHARE_ENABLED==='true'&&body.stockCustody===undefined)fail('Explicit xstocks-shares-v2 custody is required for new Trade drafts.')
  let stockCustody:StockCustody|undefined
  if (body.stockCustody !== undefined) {
    if (body.stockCustody !== SHARE_CUSTODY_POLICY) fail('Unsupported stock custody policy.')
    const factory=env.HASHPAYLINK_XSTOCKS_SHARE_FACTORY||''
    if(env.HASHPAYLINK_XSTOCKS_SHARE_ENABLED!=='true'||!isAddress(factory)||/^0x0{40}$/i.test(factory))throw Object.assign(Error('Share-based stock checkout is not enabled yet.'),{status:409})
    stockCustody={policy:SHARE_CUSTODY_POLICY,factory:getAddress(factory)}
  }
  return { ...(stockCustody?{stockCustody}:{}), kind:'trade', trade, version:1, title:text(body.title,1,160), description:text(body.description,1,4000), amount,
    durationSeconds:trade.dispatchDays*86400, xlayerPayment:payment }
}
export function prepareTradeCheckoutBinding(id: string, terms: WorkTermsForBinding, buyer: string, seller: string, now: number) {
  if (terms.kind !== 'trade' || !terms.trade) throw Error('Trade terms are unavailable.')
  const binding = prepareWorkBinding(id, terms, buyer, seller, now)
  // Separate namespace and digest: a delivery agreement must never become a work agreement.
  const contractTerms = { ...binding.contractTerms, offerId:keccak256(stringToHex('hashpaylink:trade:'+id)), deliveryWindow:terms.trade.deliveryDays*86400 }
  if(terms.stockCustody){if(terms.stockCustody.policy!==SHARE_CUSTODY_POLICY)throw Error('Unsupported custody policy.');binding.factory=getAddress(terms.stockCustody.factory);binding.custody=SHARE_CUSTODY_POLICY;if([buyer,seller,contractTerms.arbiter,contractTerms.token].some(a=>a.toLowerCase()===binding.factory.toLowerCase()))throw Error('Factory must be distinct from participants and asset.')}
  const termsHash = keccak256(stringToHex(JSON.stringify({ policy:terms.stockCustody?SHARE_CUSTODY_POLICY:'trade-xlayer-v1', id, terms, contractTerms })))
  return { ...binding, termsHash, contractTerms:{ ...contractTerms, termsHash } }
}

export function tradeCheckoutEnvironment(env:NodeJS.ProcessEnv,partnerId:string):NodeJS.ProcessEnv {
  const projects=(env.HASHPAYLINK_TRADE_XSTOCKS_PROJECTS||'').split(',').map(value=>value.trim()).filter(Boolean)
  return {...env,HASHPAYLINK_XSTOCKS_SHARE_ASSETS:'true',HASHPAYLINK_AGREEMENT_XSTOCKS_ENABLED:env.HASHPAYLINK_TRADE_XSTOCKS_ENABLED==='true'&&projects.includes(partnerId)?'true':'false'}
}
