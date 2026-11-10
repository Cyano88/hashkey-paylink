import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import {bankFeeDisclosure} from './bank-quotes.js'
import {walletFeeDisclosure} from './wallet-quotes.js'
import {marketplaceWalletReceipt} from './wallet-receipt.js'
import {marketplaceBankReceipt} from './bank-receipt.js'
import type {createMarketplaceRepository} from './repository.js'
import {createMarketplacePrincipalResolver} from './authorization.js'

export type MarketplaceScope = 'marketplace:read' | 'marketplace:create' | 'marketplace:release' | 'marketplace:payout' | 'marketplace:refund'
export type MarketplacePrincipal = {
  projectId: string
  credentialId: string
  active: boolean
  capabilities: string[]
  scopes: string[]
}
type Repository = Pick<ReturnType<typeof createMarketplaceRepository>, 'feeReserve' | 'get' | 'sellerBalances' | 'execute' | 'reserveBankPayout' | 'walletPayouts' | 'refunds' | 'cancelPayout'>
type Dependencies = {
  createCheckout?: (projectId:string,paymentId:string,presentation:{title:string;returnUrl:string})=>Promise<{checkoutId:string;checkoutUrl:string;paymentId:string;amount:string;network:'base';asset:'USDC';expiresAt:string}>
  repository: Repository
  /** Trusted server-side credential lookup, never a principal supplied in the request body. */
  resolvePrincipal?: (credential: string) => Promise<MarketplacePrincipal | null>
  /** Explicit gate. The default resolver also requires rollout configuration. */
  enabled?: boolean
}

function reference(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(value)) throw Error('Invalid marketplace reference.')
  return value
}
function fields(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid marketplace instruction.')
  const record = value as Record<string, unknown>
  if (Object.keys(record).length !== keys.length || keys.some(key=>!Object.hasOwn(record,key)) || Object.keys(record).some(key=>!keys.includes(key))) throw Error('Unexpected or missing marketplace instruction fields.')
  return record
}

/** Application boundary. No generic command, funding or result endpoint. */
export function createMarketplaceInstructions(dependencies: Dependencies) {
  const {repository, resolvePrincipal = createMarketplacePrincipalResolver(), enabled = false} = dependencies
  async function authorize(credential: string, scope: MarketplaceScope) {
    if (!enabled) throw Error('Marketplace instructions are not enabled.')
    if (typeof credential !== 'string' || !credential.trim()) throw Error('Marketplace authorization required.')
    const resolved = await resolvePrincipal(credential)
    if (!resolved || resolved.active !== true || !Array.isArray(resolved.capabilities) || !resolved.capabilities.includes('marketplace_payments') || !Array.isArray(resolved.scopes) || !resolved.scopes.includes(scope)) throw Error('Marketplace authorization denied.')
    return {projectId:reference(resolved.projectId), credentialId:reference(resolved.credentialId)}
  }
  return {
    async createCheckout(credential:string,body:unknown){
      const input=fields(structuredClone(body),['paymentId','title','returnUrl'])
      if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100||typeof input.returnUrl!=='string'||input.returnUrl.length>300)throw Error('Invalid Marketplace checkout presentation.')
      const principal=await authorize(credential,'marketplace:create')
      if(!dependencies.createCheckout)throw Error('Marketplace checkout creation is not configured.')
      return dependencies.createCheckout(principal.projectId,reference(input.paymentId),{title:input.title,returnUrl:input.returnUrl})
    },
    async cancelPayout(credential:string,key:string,body:unknown){
      const input=fields(structuredClone(body),['paymentId','operationId','businessReference'])
      const principal=await authorize(credential,'marketplace:payout')
      const operation=await repository.cancelPayout(principal.projectId,reference(input.paymentId),reference(key),reference(input.operationId),{credentialId:principal.credentialId,businessReference:reference(input.businessReference)})
      return {paymentId:input.paymentId,operationId:operation.id,status:'cancelled',amountUnits:operation.units}
    },
    async reserveRefund(credential: string, key: string, body: unknown) {
      const input=fields(structuredClone(body),['paymentId','refundId','allocations','businessReference'])
      const paymentId=reference(input.paymentId),refundId=reference(input.refundId),businessReference=reference(input.businessReference)
      reference(key)
      if(!Array.isArray(input.allocations)||input.allocations.length<1||input.allocations.length>100)throw Error('Provide between 1 and 100 refund allocations.')
      const allocations=input.allocations.map(value=>{const row=fields(value,['allocationId','amount']);return {allocationId:reference(row.allocationId),amount:row.amount as string}})
      const principal=await authorize(credential,'marketplace:refund')
      const result=await repository.refunds.reserve(principal.projectId,paymentId,key,{refundId,allocations},{credentialId:principal.credentialId,businessReference})
      return {paymentId,refundId,asset:result.reservation.collection.asset,network:'base',amountUnits:result.reservation.amountUnits,allocations:result.operations.map(operation=>({allocationId:operation.allocationId,operationId:operation.id,amountUnits:operation.units,status:operation.status}))}
    },
    async reserveWalletPayout(credential: string, key: string, body: unknown) {
      const input = fields(structuredClone(body),['paymentId','operationId','allocationId','amount','businessReference'])
      const paymentId=reference(input.paymentId), operationId=reference(input.operationId), allocationId=reference(input.allocationId), businessReference=reference(input.businessReference)
      reference(key)
      const principal=await authorize(credential,'marketplace:payout')
      const result=await repository.walletPayouts.reserve(principal.projectId,paymentId,key,{operationId,allocationId,amount:input.amount as string},{credentialId:principal.credentialId,businessReference})
      return {paymentId,operationId,status:result.operation.status,network:result.reservation.network,asset:result.reservation.asset,amountUnits:result.reservation.amountUnits,beneficiaryId:result.reservation.beneficiaryId}
    },
    async fundRefundFees(credential:string,key:string,body:unknown){
      const input=fields(structuredClone(body),['paymentId','allocationId','amount'])
      const principal=await authorize(credential,'marketplace:payout')
      return repository.feeReserve.fund(principal.projectId,reference(input.paymentId),reference(input.allocationId),reference(key),marketplaceAmountUnits(input.amount as string),principal.credentialId)
    },
    async refundFeeBalance(credential:string){const principal=await authorize(credential,'marketplace:read');return repository.feeReserve.balance(principal.projectId)},
    async walletPayoutQuote(credential:string,body:unknown){
      const input=fields(structuredClone(body),['paymentId','quoteId'])
      const principal=await authorize(credential,'marketplace:payout')
      const quote=await repository.walletPayouts.preview(principal.projectId,reference(input.paymentId),reference(input.quoteId))
      return {...walletFeeDisclosure(quote),paymentId:quote.paymentId,operationId:quote.operationId,beneficiaryId:quote.beneficiaryId,recipient:quote.recipient,network:quote.network}
    },
    async walletPayoutReceipt(credential:string,paymentId:string,operationId:string){
      const principal=await authorize(credential,'marketplace:read')
      const book=await repository.get(principal.projectId,reference(paymentId))
      if(!book)throw Error('Marketplace payment not found.')
      return marketplaceWalletReceipt(book,reference(operationId))
    },
    async bankPayoutReceipt(credential:string,paymentId:string,operationId:string){
      const principal=await authorize(credential,'marketplace:read')
      const book=await repository.get(principal.projectId,reference(paymentId))
      if(!book)throw Error('Marketplace payment not found.')
      return marketplaceBankReceipt(book,reference(operationId))
    },
    async reserveQuotedWalletPayout(credential:string,key:string,body:unknown){
      const input=fields(structuredClone(body),['paymentId','quoteId','businessReference'])
      const principal=await authorize(credential,'marketplace:payout')
      const result=await repository.walletPayouts.reserveQuoted(principal.projectId,reference(input.paymentId),reference(key),reference(input.quoteId),{credentialId:principal.credentialId,businessReference:reference(input.businessReference)})
      const quote=result.reservation.quote!
      return {paymentId:quote.paymentId,operationId:quote.operationId,status:result.operation.status,network:quote.network,beneficiaryId:quote.beneficiaryId,...walletFeeDisclosure(quote,result.operation.status==='settled'?true:result.operation.status==='failed'?false:undefined)}
    },
    async reserveBankPayout(credential: string, key: string, body: unknown) {
      const input = fields(structuredClone(body),['paymentId','quoteId','businessReference'])
      const paymentId = reference(input.paymentId), quoteId = reference(input.quoteId), businessReference = reference(input.businessReference)
      reference(key)
      const principal = await authorize(credential,'marketplace:payout')
      const result = await repository.reserveBankPayout(principal.projectId,paymentId,quoteId,key,{credentialId:principal.credentialId,businessReference})
      const {quote} = result.reservation
      // Reservation is not payment success. Exclude holding/provider identities and internal proof references.
      return {paymentId,quoteId,operationId:result.operation.id,status:result.operation.status,asset:quote.asset,currency:quote.currency,debitUnits:quote.debitUnits,feeUnits:quote.feeUnits,ngnMinor:quote.ngnMinor,fees:bankFeeDisclosure(quote,result.operation.status==='settled'?true:result.operation.status==='failed'?false:undefined)}
    },
    async payment(credential: string, paymentId: string) {
      const principal = await authorize(credential,'marketplace:read')
      const book = await repository.get(principal.projectId,reference(paymentId))
      if (!book) return null
      // Internal evidence and credential-bearing command journals are not developer responses.
      return structuredClone({collectionStatus:book.collectionStatus??(book.fundingEvidence?'finalized':'awaiting_payment'),plan:book.plan, balances:book.balances, operations:book.operations.map(({evidenceId: _evidence, ...operation})=>{const quote=book.walletReservations?.find(r=>r.operationId===operation.id)?.quote;const bankQuote=book.bankReservations?.find(r=>r.quote.operationId===operation.id)?.quote;const final=operation.status==='settled'?true:operation.status==='failed'?false:undefined;return {...operation,...(quote?{fees:walletFeeDisclosure(quote,final)}:bankQuote?{fees:bankFeeDisclosure(bankQuote,final)}:{})}}), funded:!!book.fundingEvidence})
    },
    async sellerBalances(credential: string, sellerId: string) {
      const principal = await authorize(credential,'marketplace:read')
      return repository.sellerBalances(principal.projectId,reference(sellerId))
    },
    async release(credential: string, key: string, body: unknown) {
      // Copy before awaiting authentication so a caller cannot change the instruction in flight.
      const input = fields(structuredClone(body),['paymentId','businessReference','releases'])
      const paymentId = reference(input.paymentId), businessReference = reference(input.businessReference)
      reference(key)
      if (!Array.isArray(input.releases) || input.releases.length < 1 || input.releases.length > 100) throw Error('Provide between 1 and 100 releases.')
      const releases = input.releases.map(value=>{
        const release = fields(value,['allocationId','amount'])
        return {allocationId:reference(release.allocationId), amountUnits:marketplaceAmountUnits(release.amount as string)}
      }).sort((a,b)=>a.allocationId < b.allocationId ? -1 : a.allocationId > b.allocationId ? 1 : 0)
      if (new Set(releases.map(r=>r.allocationId)).size !== releases.length) throw Error('Duplicate release allocation.')
      const principal = await authorize(credential,'marketplace:release')
      const book = await repository.execute(principal.projectId,paymentId,key,{type:'release_batch',releases,authorization:{credentialId:principal.credentialId,businessReference}})
      return {paymentId:book.plan.paymentId, balances:structuredClone(book.balances)}
    },
  }
}
