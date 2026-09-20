export type PocketMigrationReview = {
  phase: 'review' | 'completed'
  rows: Array<{ network: 'base' | 'arbitrum' | 'arc'; balance: number | null; status: 'ok' | 'unavailable' }>
  transferAvailable: false
}
