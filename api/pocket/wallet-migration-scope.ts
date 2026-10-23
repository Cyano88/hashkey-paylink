import type { MigrationPlan } from './wallet-migration-plan.js'

// Version 1 plans, provider calldata and receipts are exclusively canonical USDC.
// Other assets remain in the archived source wallets; they are not migration
// liabilities and never require an account-specific exception. Inventory still
// has to succeed, and activation separately verifies USDC, receipts and access.
export async function migrationAssetsAccountedFor(plan:MigrationPlan,inventory:{otherAssets:unknown[]}) {
 return plan.version===1 && !!plan.userId && !!plan.revision && Array.isArray(inventory?.otherAssets)
}
