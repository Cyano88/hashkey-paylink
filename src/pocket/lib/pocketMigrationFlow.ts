export type PocketMigrationNetwork = 'base' | 'arbitrum' | 'arc'
export type PocketMigrationSnapshot = {
  enabled: boolean
  phase: 'review' | 'pending' | 'ready-to-activate' | 'completed'
  revision: string
  rows: Array<{network:PocketMigrationNetwork;amount:string;state:'empty'|'ready'|'pending'|'confirmed'}>
}
export type PocketMigrationFee = {
  id:string;revision:string;network:PocketMigrationNetwork;amount:string;asset:'ETH'|'USDC';expiresAt:number
  transferAmount:string;source:{walletId:string;address:string};target:{walletId:string;address:string}
}
