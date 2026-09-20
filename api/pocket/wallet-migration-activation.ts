import { circleLinkKey } from '../privy-circle-link.js'
import { withDurablePostgresTransaction } from '../render-durable-store.js'
import { migrationNetworks, type MigrationPlan } from './wallet-migration-plan.js'
import { migrationTransfersConfirmed } from './wallet-migration-execution.js'

// This internal activation service is deliberately not exposed as an HTTP route.
export async function activateMigration(plan: MigrationPlan, io: {
  verify(plan: MigrationPlan): Promise<{ revision: string; checkedAt: number; oldBalancesEmpty: boolean; assetsAccountedFor: boolean; noPendingOperations: boolean; legacyAccessReady: boolean }>
  transaction?: typeof withDurablePostgresTransaction
  now?: () => number
}) {
  if (!migrationTransfersConfirmed(plan)) throw new Error('Migration transfers are not confirmed.')
  const now = io.now ?? Date.now
  const proof = await io.verify(plan)
  const age = now() - proof.checkedAt
  if (proof.revision !== plan.revision || !Number.isFinite(age) || age < 0 || age > 15_000 || !proof.oldBalancesEmpty || !proof.assetsAccountedFor || !proof.noPendingOperations || !proof.legacyAccessReady) throw new Error('Wallet activation verification is incomplete.')
  return (io.transaction ?? withDurablePostgresTransaction)(async client => {
    const planKey = 'pocket:wallet-migration-plan:v1:' + plan.userId
    const result = await client.query('select value from render_durable_kv where store_key = $1 for update', [planKey])
    const current = result.rows[0]?.value as MigrationPlan | undefined
    if (!current || current.userId !== plan.userId || current.revision !== plan.revision || !migrationTransfersConfirmed(current)) throw new Error('Migration changed before activation.')
    // Use the same locks as the normal link compare-and-swap path.
    const keys = migrationNetworks.map(network => circleLinkKey(plan.userId, network, 'payment')).sort()
    for (const key of keys) await client.query('select pg_advisory_xact_lock(hashtext($1))', [key])
    const links = await client.query('select * from privy_circle_links where link_key = any($1::text[]) for update', [keys])
    if (links.rows.length !== 3) throw new Error('Current payment wallet links are incomplete.')
    if (now() - proof.checkedAt > 15_000) throw new Error('Wallet activation verification expired.')
    const matches = (row: MigrationPlan['rows'][number], target: boolean) => {
      const link = links.rows.find(link => link.link_key === circleLinkKey(plan.userId, row.network, 'payment'))
      const expected = target ? row.target : row.source
      return link && link.privy_user_id === plan.userId && link.chain === row.network && (link.purpose ?? 'payment') === 'payment' && link.circle_wallet_id === expected.walletId && String(link.circle_wallet_address).toLowerCase() === expected.address.toLowerCase()
    }
    if (current.phase === 'confirmed') {
      if (!current.rows.every(row => matches(row, true))) throw new Error('Activated wallet links have changed.')
      return { completed: true as const, replayed: true }
    }
    if (!current.rows.every(row => matches(row, false))) throw new Error('Current wallet links changed before activation.')
    // Preserve legacy identifiers in the same transaction, before replacing links.
    await client.query('insert into render_durable_kv (store_key,value) values ($1,$2::jsonb)', ['pocket:wallet-migration-legacy:v1:' + plan.userId, JSON.stringify({ version: 1, userId: plan.userId, revision: current.revision, links: links.rows, archivedAt: now() })])
    for (const row of current.rows) {
      const saved = await client.query('update privy_circle_links set circle_wallet_id=$2, circle_wallet_address=$3, circle_blockchain=$4, updated_at=now() where link_key=$1 and circle_wallet_id=$5', [circleLinkKey(plan.userId,row.network,'payment'), row.target.walletId, row.target.address, { base:'BASE', arbitrum:'ARB', arc:'ARC' }[row.network], row.source.walletId])
      if (saved.rowCount !== 1) throw new Error('Wallet activation conflict.')
    }
    const completedAt = now()
    const record = { version: 2, userId: plan.userId, phase: 'completed', sources: Object.fromEntries(current.rows.map(row=>[row.network,row.source])), targets: Object.fromEntries(current.rows.map(row=>[row.network,row.target])), replacementVerifiedAt: current.reviewedAt, executionVerifiedAt: proof.checkedAt, completedAt }
    await client.query('insert into render_durable_kv (store_key,value) values ($1,$2::jsonb) on conflict (store_key) do update set value=excluded.value,updated_at=now()', ['pocket:wallet-update:v2:' + plan.userId, JSON.stringify(record)])
    await client.query('update render_durable_kv set value=$2::jsonb,updated_at=now() where store_key=$1', [planKey, JSON.stringify({ ...current, phase: 'confirmed' })])
    return { completed: true as const, replayed: false }
  })
}
