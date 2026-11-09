import {marketplaceAmountUnits} from '../../src/lib/marketplacePayments.js'
import type {createMarketplaceRepository} from './repository.js'

export type MarketplaceScope = 'marketplace:read' | 'marketplace:release'
export type MarketplacePrincipal = {
  projectId: string
  credentialId: string
  active: boolean
  capabilities: string[]
  scopes: string[]
}
type Repository = Pick<ReturnType<typeof createMarketplaceRepository>, 'get' | 'sellerBalances' | 'execute'>
type Dependencies = {
  repository: Repository
  /** Trusted server-side credential lookup, never a principal supplied in the request body. */
  resolvePrincipal: (credential: string) => Promise<MarketplacePrincipal | null>
  /** Explicit internal gate. No production resolver or public route is installed. */
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

/** Unmounted application boundary. No generic command, funding, result, payout or refund endpoint. */
export function createMarketplaceInstructions(dependencies: Dependencies) {
  const {repository, resolvePrincipal, enabled = false} = dependencies
  async function authorize(credential: string, scope: MarketplaceScope) {
    if (!enabled) throw Error('Marketplace instructions are not enabled.')
    if (typeof credential !== 'string' || !credential.trim()) throw Error('Marketplace authorization required.')
    const resolved = await resolvePrincipal(credential)
    if (!resolved || resolved.active !== true || !Array.isArray(resolved.capabilities) || !resolved.capabilities.includes('marketplace_payments') || !Array.isArray(resolved.scopes) || !resolved.scopes.includes(scope)) throw Error('Marketplace authorization denied.')
    return {projectId:reference(resolved.projectId), credentialId:reference(resolved.credentialId)}
  }
  return {
    async payment(credential: string, paymentId: string) {
      const principal = await authorize(credential,'marketplace:read')
      const book = await repository.get(principal.projectId,reference(paymentId))
      if (!book) return null
      // Internal evidence and credential-bearing command journals are not developer responses.
      return structuredClone({plan:book.plan, balances:book.balances, operations:book.operations.map(({evidenceId: _evidence, ...operation})=>operation), funded:!!book.fundingEvidence})
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
