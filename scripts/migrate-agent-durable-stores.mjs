// Run on the deployed service after the archive is verified and adapters are live.
// Outputs aggregate counts only; never records, wallet IDs or session material.
import { migratedJsonStore } from '../api/migrated-json-store.ts'
import { hasRenderDurableStore } from '../api/render-durable-store.ts'
if (!hasRenderDurableStore() || !process.env.DATA_PATH) throw Error('Database and source disk are required.')
const root=process.env.DATA_PATH
const profiles=migratedJsonStore((process.env.AGENT_PROFILE_STORE_KEY ?? 'hashpaylink:agent-profiles').trim(),process.env.AGENT_PROFILE_STORE ?? `${root}/agent-profiles.json`,()=>({agents:{}}))
const wallets=migratedJsonStore((process.env.AGENT_WALLET_PROVISION_STORE_KEY ?? 'hashpaylink:agent-wallet-provisioning').trim(),process.env.AGENT_WALLET_PROVISION_STORE ?? `${root}/agent-wallet-provisioning.json`,()=>({pending:{},agents:{}}))
try {
 const a=await profiles.read();const b=await wallets.read()
 console.log(JSON.stringify({agentProfiles:Object.keys(a.agents ?? {}).length,agentWallets:Object.keys(b.agents ?? {}).length,pendingConnections:Object.keys(b.pending ?? {}).length,diskDetached:false}))
 process.exit(0)
} catch {
 console.error('Migration stopped; original disk preserved. Inspect the database and source availability.')
 process.exit(1)
}
