import { getAddress, isAddress, keccak256, parseUnits, stringToHex, type Address } from 'viem'
import { ARC_AGREEMENT_NETWORK } from '../arc-agreement-config.js'
import { parseTradeDetails, tradeText } from './terms.js'

export const ARC_TRADE_POLICY = 'trade-arc-usdc-v1' as const
export type ArcTradeRelease = Readonly<{
  policy: typeof ARC_TRADE_POLICY
  chainId: 5042
  factory: Address
  arbiter: Address
  factoryRuntimeHash: `0x${string}`
}>
// The service-agreement factory is not a Trade factory. Populate this only from
// a separately verified Trade deployment; environment variables cannot replace it.
export const ARC_TRADE_RELEASE: ArcTradeRelease | null = null

function fail(message: string, status = 400): never { throw Object.assign(Error(message), { status }) }
export function parseArcTradeCheckout(body: Record<string, unknown>) {
  if (body.kind !== 'trade' || body.paymentRail !== 'arc' || body.chainId !== 5042 || (body.network !== undefined && body.network !== 'arc')) fail('Choose USDC on Arc mainnet for this Trade.')
  if (body.stockCustody !== undefined || body.xlayerPayment !== undefined) fail('Stock custody cannot be used for an Arc USDC Trade.')
  if (typeof body.paymentToken !== 'string' || !isAddress(body.paymentToken) || getAddress(body.paymentToken) !== ARC_AGREEMENT_NETWORK.usdc) fail('Arc Trade requires the official USDC token.')
  const { trade, amount } = parseTradeDetails(body, 6)
  const amountUnits = parseUnits(amount, 6)
  return {
    kind: 'trade' as const, version: 1 as const,
    title: tradeText(body.title,1,160), description: tradeText(body.description,1,4000),
    amount, trade,
    payment: { policy: ARC_TRADE_POLICY, rail: 'arc' as const, chainId: 5042 as const,
      token: ARC_AGREEMENT_NETWORK.usdc, decimals: 6 as const, amountUnits: amountUnits.toString() },
  }
}
export type ArcTradeTerms = ReturnType<typeof parseArcTradeCheckout>
export function arcTradeAvailability(env: NodeJS.ProcessEnv, projectId: string) {
  const allowed = (env.HASHPAYLINK_TRADE_ARC_PROJECTS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (!ARC_TRADE_RELEASE) return { enabled: false, reason: 'deployment_pending' as const }
  if (env.HASHPAYLINK_TRADE_ARC_ENABLED !== 'true') return { enabled: false, reason: 'paused' as const }
  if (!/^dev_[a-z0-9]{8,64}$/i.test(projectId) || !allowed.includes(projectId)) return { enabled: false, reason: 'project_not_enabled' as const }
  return { enabled: true, reason: null }
}
export function prepareArcTradeBinding(id: string, terms: ArcTradeTerms, buyer: string, seller: string, now: number) {
  const release = ARC_TRADE_RELEASE
  if (!release) fail('Arc Trade deployment is pending verification.',409)
  return bindArcTradeTerms(id,terms,buyer,seller,now,release)
}
// Pure builder used by deployment rehearsal. It does not authorize execution or
// select a production release. Production callers use prepareArcTradeBinding.
export function bindArcTradeTerms(id: string, terms: ArcTradeTerms, buyer: string, seller: string, now: number, release: ArcTradeRelease) {
  if (!/^tag_[a-f0-9]{64}$/.test(id) || !Number.isSafeInteger(now) || now < 0 || now > Number.MAX_SAFE_INTEGER - 86400) fail('Invalid Arc Trade binding.')
  if (release.policy !== ARC_TRADE_POLICY || release.chainId !== 5042 || !/^0x[a-f0-9]{64}$/i.test(release.factoryRuntimeHash)) fail('Invalid Arc Trade release.')
  // Revalidate all values before constructing executable contract terms.
  const checked = parseArcTradeCheckout({kind:terms.kind,paymentRail:terms.payment.rail,chainId:terms.payment.chainId,
    paymentToken:terms.payment.token,title:terms.title,description:terms.description,amount:terms.amount,trade:terms.trade})
  if (terms.version !== 1 || terms.payment.policy !== ARC_TRADE_POLICY || terms.payment.decimals !== 6
    || terms.payment.amountUnits !== checked.payment.amountUnits) fail('Arc Trade payment terms changed.')
  const roles = [buyer,seller,release.arbiter,release.factory,checked.payment.token].map(value => getAddress(value))
  if (roles.some(value => /^0x0{40}$/i.test(value)) || new Set(roles.map(value => value.toLowerCase())).size !== roles.length) fail('Trade participants, authority, factory and token must be distinct.')
  const contractTerms = {
    offerId: keccak256(stringToHex('hashpaylink:trade:arc:5042:'+id)),
    buyer: roles[0], seller: roles[1], arbiter: roles[2], token: roles[4],
    amount: checked.payment.amountUnits, decimals: 6, fundBy: now + 86400,
    dispatchWindow: checked.trade.dispatchDays * 86400, deliveryWindow: checked.trade.deliveryDays * 86400,
    inspectionWindow: checked.trade.inspectionHours * 3600,
  }
  const termsHash = keccak256(stringToHex(JSON.stringify({policy:ARC_TRADE_POLICY,chainId:5042,factory:roles[3],id,terms:checked,contractTerms})))
  return { policy:ARC_TRADE_POLICY,chainId:5042 as const,factory:roles[3],termsHash,contractTerms:{...contractTerms,termsHash} }
}
