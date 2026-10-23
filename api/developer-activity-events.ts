import { createHash } from 'node:crypto'

export type JournalSource = 'checkout' | 'agreement' | 'agreement_event' | 'funding'
export type ProjectActivityEvent = {
  projectId: string; environment: 'live' | 'test'; product: 'checkout' | 'agreement' | 'funding';
  recordId: string; event: string; occurredAt: string; details: Record<string, string>;
}
type Row = Record<string, any>
const text = (value: unknown) => typeof value === 'string' || typeof value === 'number' ? String(value).slice(0, 240) : ''
const fields = (value: Row, names: string[]) => Object.fromEntries(names.flatMap(name => text(value[name]) ? [[name, text(value[name])]] : []))

// Only server-owned, explicitly selected fields enter the journal. Never copy raw records.
export function projectActivitySnapshots(source: JournalSource, store: unknown): ProjectActivityEvent[] {
  const root = (store ?? {}) as Row
  const collection = root[{checkout:'checkouts',agreement:'agreements',agreement_event:'events',funding:'records'}[source]] ?? {}
  const result: ProjectActivityEvent[] = []
  for (const r of Object.values(collection) as Row[]) {
    if (!/^dev_[a-z0-9]{8,64}$/i.test(text(r.partnerId))) continue // Legacy private partners are not developer projects.
    if (r.environment !== undefined && r.environment !== 'live') throw new Error('This activity adapter only supports live source stores.')
    // Retired/ambiguous Arc sources must never be relabeled as live history.
    const usesArc = r.network === 'arc' || r.payment?.network === 'arc' || r.paymentOptions?.some((option: Row) => option.network === 'arc')
    if (source === 'checkout' && usesArc && r.arcMainnetChainId !== 5042) continue
    if (source === 'agreement' && r.environment !== 'live') continue
    if (source === 'agreement_event' && Number(r.data?.chainId) !== 5042) continue
    if (source === 'funding' && (!Array.isArray(r.networks) || !r.networks.length || r.networks.some((network: unknown) => network !== 'base' && network !== 'arbitrum'))) continue
    const product = source === 'agreement_event' ? 'agreement' : source
    const recordId = text(source === 'agreement_event' ? r.agreementId : r.id)
    const add = (event: string, occurredAt: unknown, details: Record<string,string>) => {
      const date = new Date(text(occurredAt))
      if (!recordId || !Number.isFinite(date.getTime())) throw new Error('Invalid activity source reference or timestamp.')
      result.push({projectId:r.partnerId,environment:'live',product,recordId,event,occurredAt:date.toISOString(),details})
    }
    if (source === 'checkout') {
      const common = {...fields(r,['amount','network','expiresAt']), asset:'USDC', mode:r.checkoutMode === 'agentic' ? 'agentic' : 'human', ...fields(r.providerFunding??{},['requestId'])}
      add('checkout.created',r.createdAt,common)
      for (const a of r.paymentAttempts??[]) {
        add(a.status==='paid' && a.referenceType==='circle_gateway_transfer' ? 'checkout.payment_accepted' : `checkout.${text(a.status)}`,a.updatedAt??a.createdAt,{...common,...fields(a,['id','amount','network','referenceType','transaction','receiptId']),evidence:'payment_attempt'})
      }
      if (r.payment) add(r.payment.status==='paid' && r.payment.referenceType==='circle_gateway_transfer' ? 'payment.gateway_accepted' : `payment.${text(r.payment.status)}`,r.paymentAttempts?.[r.paymentAttempts.length-1]?.updatedAt??r.payment.confirmedAt,{...common,...fields(r.payment,['amount','network','referenceType','txHash','confirmedAt']),evidence:r.payment.referenceType==='circle_gateway_transfer'?'gateway_acceptance':'payment_verifier'})
      if (r.payout) add(`payout.${text(r.payout.status)}`,r.payout.deliveredAt??r.paymentAttempts?.[r.paymentAttempts.length-1]?.updatedAt??r.createdAt,{...fields(r.settlement??{},['orderId','intentId','amountNgn']),asset:'NGN',evidence:'provider_status'})
    } else if (source === 'agreement') {
      add('agreement.draft_created',r.createdAt,{...fields(r,['amount','network','termsHash','clientReference']),asset:'USDC',evidence:'draft_only'})
    } else if (source === 'agreement_event') {
      add(text(r.event),r.createdAt,{sourceEventId:text(r.id),...fields(r.data??{},['network','chainId','onchainAgreementId','escrow','amountUsdcUnits','releasedAmountUsdcUnits','unreleasedAmountUsdcUnits','nextStep','termsHash','observedBlockNumber']),asset:'USDC',amountUnit:'atomic_6',evidence:'reconciled_chain_snapshot'})
    } else {
      add('funding.created',r.createdAt,{...fields(r,['checkoutId','amount']),asset:'USDC',evidence:'request_only'})
      if (r.observation) add(`funding.${text(r.observation.status)}`,r.observation.observedAt,{...fields(r,['checkoutId','amount']),...fields(r.observation,['paymentStatus','bridgeStatus','network','paymentTransaction','bridgeTransaction']),asset:'USDC',evidence:'provider_observation'})
    }
  }
  return result
}

export function projectActivityKey(event: ProjectActivityEvent) {
  return createHash('sha256').update(JSON.stringify({projectId:event.projectId,environment:event.environment,product:event.product,recordId:event.recordId,event:event.event,details:Object.fromEntries(Object.entries(event.details).sort(([a],[b])=>a.localeCompare(b)))})).digest('hex')
}

export function projectActivityChanges(source: JournalSource, current: unknown, next: unknown) {
  // Preserve the last available state before operational pruning as well as new states.
  const key = {checkout:'checkouts',agreement:'agreements',agreement_event:'events',funding:'records'}[source]
  const previous = ((current??{}) as Row)[key]??{}, following = ((next??{}) as Row)[key]??{}
  const changed = [...new Set([...Object.keys(previous),...Object.keys(following)])].filter(id=>JSON.stringify(previous[id])!==JSON.stringify(following[id]))
  const select = (records:Row) => ({[key]:Object.fromEntries(changed.filter(id=>records[id]).map(id=>[id,records[id]]))})
  const before = projectActivitySnapshots(source,select(previous)), after = projectActivitySnapshots(source,select(following))
  const unique = new Map([...before,...after].map(event=>[projectActivityKey(event),event]))
  return [...unique.values()]
}
