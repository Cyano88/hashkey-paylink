import { readdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { hasRenderDurableStore } from '../api/render-durable-store.ts'
import { migrateCircleSession } from '../api/circle-cli-durable-session.ts'
if (!hasRenderDurableStore()) throw Error('Postgres is required.')
const root=process.env.AGENT_WALLET_CIRCLE_SESSION_PATH || (process.env.DATA_PATH ? `${process.env.DATA_PATH}/circle-web-sessions` : '')
if (!root) throw Error('Configure the source session directory.')
try {
 let sessions=0;let files=0;let recoveryRequired=0
 for(const entry of await readdir(root,{withFileTypes:true})) {
  if (!entry.isDirectory() || !/^[a-zA-Z0-9_-]{1,80}$/.test(entry.name)) throw Error('Unexpected session entry; inspect privately.')
  const result=await migrateCircleSession(entry.name,resolve(root,entry.name))
  sessions++;files+=result.files;if(result.phase!=='ready')recoveryRequired++
 }
 console.log(JSON.stringify({sessions,files,restored:true,recoveryRequired,diskDetached:false}))
 process.exit(0)
} catch {
 console.error('Session migration stopped. Source files remain intact; no payment was attempted.')
 process.exit(1)
}
