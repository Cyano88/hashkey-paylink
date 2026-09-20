import type {Request,Response} from 'express'
import {formatUnits} from 'viem'
import {verifiedPrivyUser,readCircleLink,circleLinkKey} from '../privy-circle-link.js'
import {readDurableJson} from '../render-durable-store.js'
import {readFreshMigrationUsdcUnits} from '../evm-balance.js'
import {createMigrationFlowHandler} from './wallet-migration-flow.js'
import {createPocketMigrationExecutor} from './wallet-migration-service.js'
import {migrationTransfersConfirmed} from './wallet-migration-execution.js'
import {migrationNetworks,type MigrationPlan} from './wallet-migration-plan.js'
import {readLegacyPaymentWallets} from './wallet-migration-history.js'
import {buildLegacyRecoveryPlan,saveLegacyRecoveryPlan} from './wallet-migration-recovery.js'
import {createMigrationProvider} from './wallet-migration-provider.js'
export const LEGACY_RECOVERY_VERSION=1
const read=(userId:string)=>readDurableJson<MigrationPlan>('pocket:wallet-recovery-plan:v1:'+userId)
const flow=createMigrationFlowHandler({read,completed:async userId=>{const plan=await read(userId);return !!plan&&plan.userId===userId&&migrationTransfersConfirmed(plan)},executor:input=>createPocketMigrationExecutor({...input,legacyRecovery:true})})
export default async function handler(req:Request,res:Response) {
 res.setHeader('Cache-Control','no-store')
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'Method not allowed.'})
 if(req.body?.action!=='review')return flow(req,res)
 try {
  const identity=await verifiedPrivyUser(req),body=req.body
  if(Object.keys(body).some(k=>!['action','network','userToken'].includes(k))||!migrationNetworks.includes(body.network)||typeof body.userToken!=='string'||!body.userToken||body.userToken.length>8000)return res.status(400).json({ok:false,error:'Choose a valid network and reconnect your wallet.'})
  const legacy=await readLegacyPaymentWallets(identity.userId)
  const source=legacy.find(w=>w.network===body.network)
  if(!source)return res.status(409).json({ok:false,error:'No previous wallet is available for this account.'})
  const values=await Promise.all(migrationNetworks.map(n=>readCircleLink(circleLinkKey(identity.userId,n,'payment'))))
  const links=Object.fromEntries(migrationNetworks.map((n,i)=>[n,values[i]])) as Parameters<typeof buildLegacyRecoveryPlan>[0]['links']
  const units=await readFreshMigrationUsdcUnits(source.network,source.walletAddress as `0x${string}`)
  const existing=await read(identity.userId)
  if(existing&&Object.keys(existing.transfers).length&&!migrationTransfersConfirmed(existing))return res.json({ok:true,network:existing.rows.find(r=>r.units!=='0')?.network,pending:true})
  if(units===0n)return res.json({ok:true,empty:true,amount:'0'})
  const plan=buildLegacyRecoveryPlan({userId:identity.userId,network:source.network,units,legacy,links})
  await createMigrationProvider(body.userToken).own(plan.rows.find(r=>r.network===source.network)!)
  const saved=await saveLegacyRecoveryPlan(plan)
  return res.json({ok:true,network:saved.rows.find(r=>r.units!=='0')?.network,amount:formatUnits(units,6)})
 }catch(error){return res.status(409).json({ok:false,error:error instanceof Error?error.message:'Previous wallet review is unavailable.'})}
}
