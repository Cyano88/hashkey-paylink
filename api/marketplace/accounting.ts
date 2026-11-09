import {createHash} from 'node:crypto'
import type {RefundExecution,MarketplaceRefundEvent} from './refund-execution.js'
import type {RefundCollection,RefundReservation} from './refunds.js'
import type {WalletBeneficiary} from './beneficiaries.js'
import type {BankBeneficiary} from './bank-beneficiaries.js'
import type {BankQuoteReservation} from './bank-quotes.js'
import type {BankExecution} from './bank-execution.js'
import type {WalletExecution} from './wallet-execution.js'
import type {WalletReconciliation,MarketplaceWalletEvent} from './wallet-reconciliation.js'
import type {WalletPayoutReservation} from './wallet-payouts.js'
import type {BankReconciliation,MarketplaceBankEvent} from './bank-reconciliation.js'
import {marketplaceAmountUnits, marketplaceSettlement, type MarketplaceAsset, type MarketplaceSettlementId} from '../../src/lib/marketplacePayments.js'

// Internal accounting foundation, not a payment verifier or public API.
// Funding and execution results must come from verified adapters before activation.
export type AllocationInput = {id: string; sellerId: string; role: 'seller'|'platform'; amount: string; settlement: MarketplaceSettlementId; beneficiaryId: string}
export type MarketplacePlan = {
  projectId: string; paymentId: string; network: 'base'; asset: MarketplaceAsset; amountUnits: string;
  allocations: Array<Omit<AllocationInput, 'amount'> & {amountUnits: string}>
}
type Balance = {allocationId: string; pending: string; available: string; reserved: string; paid: string; refunded: string}
type Operation = {id: string; allocationId: string; kind: 'payout'|'refund'; units: string; fromPending: string; fromAvailable: string; status: 'reserved'|'unknown'|'settled'|'failed'; evidenceId?: string}
export type MarketplaceBook = {refundExecutions?:RefundExecution[]; refundEvents?:MarketplaceRefundEvent[]; plan: MarketplacePlan; refundCollection?:RefundCollection; refundReservations?:RefundReservation[]; walletReconciliations?:WalletReconciliation[]; walletEvents?:MarketplaceWalletEvent[]; walletExecutions?:WalletExecution[]; walletReservations?:WalletPayoutReservation[]; bankReconciliations?:BankReconciliation[]; bankEvents?:MarketplaceBankEvent[]; bankExecutions?: BankExecution[]; bankReservations?: BankQuoteReservation[]; beneficiarySnapshots?: Array<WalletBeneficiary|BankBeneficiary>; fundingEvidence?: string; balances: Balance[]; operations: Operation[]; journal: Array<{key: string; hash: string; command: MarketplaceCommand}>}
export type MarketplaceCommand =
  | {type: 'fund'; evidenceId: string; network: 'base'; asset: MarketplaceAsset; amountUnits: string}
  | {type: 'release'; allocationId: string; amountUnits: string}
  | {type: 'release_batch'; releases: Array<{allocationId: string; amountUnits: string}>; authorization: {credentialId: string; businessReference: string}}
  | {type: 'reserve'; operationId: string; allocationId: string; kind: 'payout'|'refund'; amountUnits: string}
  | {type: 'result'; operationId: string; status: 'unknown'|'settled'|'failed'; evidenceId: string}

function identifier(value: string) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9:_.-]{1,159}$/.test(value)) throw Error('Invalid marketplace reference.')
  return value
}
function units(value: string) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,23}$/.test(value)) throw Error('Use positive integer asset units.')
  return BigInt(value)
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '['+value.map(canonical).join(',')+']'
  if (value && typeof value === 'object') return '{'+Object.keys(value).sort().map(key => JSON.stringify(key)+':'+canonical((value as Record<string,unknown>)[key])).join(',')+'}'
  return JSON.stringify(value)
}

export function createMarketplacePlan(input: {projectId: string; paymentId: string; network: string; asset: string; amount: string; allocations: AllocationInput[]}): MarketplacePlan {
  identifier(input.projectId); identifier(input.paymentId)
  if (input.network !== 'base' || !['USDC','USDT'].includes(input.asset)) throw Error('Marketplace payments support USDC or USDT on Base only.')
  if (!Array.isArray(input.allocations) || input.allocations.length < 1 || input.allocations.length > 100) throw Error('Provide between 1 and 100 allocations.')
  const ids = new Set<string>()
  const allocations = input.allocations.map(a => {
    identifier(a.id); identifier(a.sellerId); identifier(a.beneficiaryId)
    if (ids.has(a.id)) throw Error('Duplicate allocation reference.')
    ids.add(a.id)
    if (a.role !== 'seller' && a.role !== 'platform') throw Error('Invalid allocation role.')
    marketplaceSettlement(a.settlement, input.asset, input.network)
    return {id:a.id, sellerId:a.sellerId, role:a.role, beneficiaryId:a.beneficiaryId, settlement:a.settlement, amountUnits:marketplaceAmountUnits(a.amount)}
  })
  const amountUnits = marketplaceAmountUnits(input.amount)
  if (allocations.reduce((sum,a)=>sum+BigInt(a.amountUnits),0n) !== BigInt(amountUnits)) throw Error('Seller allocations and platform commission must equal the exact payment amount.')
  return {projectId:input.projectId, paymentId:input.paymentId, network:'base', asset:input.asset as MarketplaceAsset, amountUnits, allocations}
}

export function createMarketplaceBook(plan: MarketplacePlan): MarketplaceBook {
  return {plan:structuredClone(plan), balances:plan.allocations.map(a=>({allocationId:a.id,pending:'0',available:'0',reserved:'0',paid:'0',refunded:'0'})), operations:[], journal:[]}
}

/** Pure transition. The repository must commit the returned book atomically. */
export function applyMarketplaceCommand(book: MarketplaceBook, projectId: string, key: string, command: MarketplaceCommand): MarketplaceBook {
  if (book.plan.projectId !== projectId) throw Error('Marketplace payment not found.')
  identifier(key)
  const hash = createHash('sha256').update(canonical(command)).digest('hex')
  const replay = book.journal.find(entry=>entry.key===key)
  if (replay) { if (replay.hash !== hash) throw Error('Idempotency key was used for a different request.'); return structuredClone(book) }
  const next = structuredClone(book)
  if (command.type === 'fund') {
    identifier(command.evidenceId)
    if (next.fundingEvidence) throw Error('Payment is already funded.')
    if (command.network !== next.plan.network || command.asset !== next.plan.asset || units(command.amountUnits) !== BigInt(next.plan.amountUnits)) throw Error('Funding evidence does not match the payment.')
    next.fundingEvidence = command.evidenceId
    next.balances.forEach(b=>{b.pending=next.plan.allocations.find(a=>a.id===b.allocationId)!.amountUnits})
  } else {
    if (!next.fundingEvidence) throw Error('Payment has no verified funding.')
    if (command.type === 'release_batch') {
      identifier(command.authorization.credentialId); identifier(command.authorization.businessReference)
      if (!Array.isArray(command.releases) || command.releases.length < 1 || command.releases.length > 100) throw Error('Provide between 1 and 100 releases.')
      const seen = new Set<string>()
      for (const release of command.releases) {
        identifier(release.allocationId)
        if (seen.has(release.allocationId)) throw Error('Duplicate release allocation.')
        seen.add(release.allocationId)
        const balance = next.balances.find(b=>b.allocationId===release.allocationId)
        if (!balance) throw Error('Allocation not found.')
        const amount = units(release.amountUnits)
        if (amount > BigInt(balance.pending)) throw Error('Release exceeds pending balance.')
        balance.pending = (BigInt(balance.pending)-amount).toString()
        balance.available = (BigInt(balance.available)+amount).toString()
      }
    } else if (command.type === 'release' || command.type === 'reserve') {
      const balance = next.balances.find(b=>b.allocationId===command.allocationId)
      if (!balance) throw Error('Allocation not found.')
      const amount = units(command.amountUnits)
      if (command.type === 'release') {
        if (amount > BigInt(balance.pending)) throw Error('Release exceeds pending balance.')
        balance.pending = (BigInt(balance.pending)-amount).toString()
        balance.available = (BigInt(balance.available)+amount).toString()
      } else {
        identifier(command.operationId)
        if (!['payout','refund'].includes(command.kind)) throw Error('Invalid operation kind.')
        if (next.operations.some(o=>o.id===command.operationId)) throw Error('Operation reference already exists.')
        const eligiblePending = command.kind === 'refund' ? BigInt(balance.pending) : 0n
        if (amount > eligiblePending+BigInt(balance.available)) throw Error('Insufficient eligible balance.')
        const fromPending = amount < eligiblePending ? amount : eligiblePending
        const fromAvailable = amount-fromPending
        balance.pending = (BigInt(balance.pending)-fromPending).toString()
        balance.available = (BigInt(balance.available)-fromAvailable).toString()
        balance.reserved = (BigInt(balance.reserved)+amount).toString()
        next.operations.push({id:command.operationId,allocationId:command.allocationId,kind:command.kind,units:amount.toString(),fromPending:fromPending.toString(),fromAvailable:fromAvailable.toString(),status:'reserved'})
      }
    } else if (command.type === 'result') {
      const operation = next.operations.find(o=>o.id===command.operationId)
      if (!operation) throw Error('Operation not found.')
      if (operation.status === 'settled' || operation.status === 'failed') throw Error('Operation is already final.')
      if (!['unknown','settled','failed'].includes(command.status)) throw Error('Invalid execution result.')
      identifier(command.evidenceId)
      if (command.status !== 'unknown' && next.operations.some(o=>o.id!==operation.id && o.evidenceId===command.evidenceId)) throw Error('Execution evidence was already used.')
      const balance = next.balances.find(b=>b.allocationId===operation.allocationId)!
      if (command.status !== 'unknown') {
        balance.reserved = (BigInt(balance.reserved)-BigInt(operation.units)).toString()
        if (command.status === 'failed') {
          balance.pending = (BigInt(balance.pending)+BigInt(operation.fromPending)).toString()
          balance.available = (BigInt(balance.available)+BigInt(operation.fromAvailable)).toString()
        } else {
          const field = operation.kind === 'payout' ? 'paid' : 'refunded'
          balance[field] = (BigInt(balance[field])+BigInt(operation.units)).toString()
        }
      }
      operation.status=command.status; operation.evidenceId=command.evidenceId
    } else throw Error('Unsupported marketplace command.')
  }
  for (const balance of next.balances) {
    const values = [balance.pending,balance.available,balance.reserved,balance.paid,balance.refunded].map(BigInt)
    const expected = next.fundingEvidence ? BigInt(next.plan.allocations.find(a=>a.id===balance.allocationId)!.amountUnits) : 0n
    if (values.some(value=>value<0n) || values.reduce((sum,value)=>sum+value,0n)!==expected) throw Error('Marketplace accounting invariant failed.')
  }
  next.journal.push({key,hash,command:structuredClone(command)})
  return next
}

export function marketplaceSellerBalances(books: MarketplaceBook[], projectId: string, sellerId: string) {
  identifier(projectId); identifier(sellerId)
  return (['USDC','USDT'] as const).map(asset => {
    const total = {pending:0n, available:0n, reserved:0n, paid:0n, refunded:0n}
    for (const book of books) if (book.plan.projectId===projectId && book.plan.asset===asset) {
      for (const balance of book.balances) if (book.plan.allocations.some(a=>a.id===balance.allocationId && a.sellerId===sellerId)) {
        for (const field of Object.keys(total) as Array<keyof typeof total>) total[field]+=BigInt(balance[field])
      }
    }
    return {network:'base' as const,asset,units:Object.fromEntries(Object.entries(total).map(([field,value])=>[field,value.toString()]))}
  })
}
