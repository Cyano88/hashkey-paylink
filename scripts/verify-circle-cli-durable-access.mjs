// Read-only: checks existing mainnet wallet ownership using restored sessions.
// No payments, signing, OTP sends, session tokens or addresses are printed.
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readDurableJson } from '../api/render-durable-store.ts'
import { withCircleSession } from '../api/circle-cli-durable-session.ts'
const exec=promisify(execFile)
const entry=createRequire(import.meta.url).resolve('@circle-fin/cli')
const root=process.env.AGENT_WALLET_CIRCLE_SESSION_PATH || `${process.env.DATA_PATH}/circle-web-sessions`
try {
 const store=await readDurableJson((process.env.AGENT_WALLET_PROVISION_STORE_KEY ?? 'hashpaylink:agent-wallet-provisioning').trim())
 if(!store?.agents) throw Error('Migrate provisioning first.')
 let checked=0,confirmedOwnership=0,requiresReauthentication=0,upgradeRequired=0,otherFailure=0
 for(const [slug,record] of Object.entries(store.agents)) {
  if(!['BASE','ARC'].includes(record.chain)||!record.sessionId)continue
  const key=`${slug}_${record.sessionId}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,80)
  const args=['wallet','list','--type','agent','--chain',record.chain,'--output','json']
  checked++
  try {
   const stdout=await withCircleSession({key,source:resolve(root,key),args},async home=>{
    const result=await exec(process.execPath,[entry,...args],{timeout:25000,maxBuffer:256*1024,shell:false,env:{...process.env,HOME:home,USERPROFILE:home,CIRCLE_CLI_HOME:resolve(home,'.circle-cli'),CIRCLE_ACCEPT_TERMS:'1'}})
    return result.stdout
   })
   const parsed=JSON.parse(stdout);const queue=[parsed];let match=false
   while(queue.length){const value=queue.shift();if(typeof value==='string'&&value.toLowerCase()===String(record.walletAddress).toLowerCase())match=true;else if(value&&typeof value==='object')queue.push(...Object.values(value))}
   if(match)confirmedOwnership++;else otherFailure++
  } catch(error) {
   const detail=[error?.stdout,error?.stderr,error?.message].filter(Boolean).join('\n')
   if(/no longer supported for wallet operations|required:[\s\S]*update:/i.test(detail))upgradeRequired++;
   else if(/AUTH_REQUIRED|AUTH_EXPIRED|expired|not logged in|not authenticated|login required|log in|no.*session|sign in/i.test(detail))requiresReauthentication++;else otherFailure++
  }
 }
 console.log(JSON.stringify({checked,confirmedOwnership,requiresReauthentication,upgradeRequired,otherFailure,readOnly:true}))
 process.exit(otherFailure||upgradeRequired?1:0)
} catch { console.error('Read-only verification stopped; no payment was attempted.');process.exit(1) }
