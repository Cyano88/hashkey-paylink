import {migrateSupportStorage,readSupportJson} from '../api/hash-support/pocket-storage.ts'
const operation=process.argv[2]
if(!['migrate','rollback','verify'].includes(operation))throw Error('Choose migrate, rollback or verify.')
const key=(process.env.POCKET_SUPPORT_STORE_KEY||'hashpaylink:pocket-support:v1').trim()
try{
 if(operation!=='verify')console.log(JSON.stringify(await migrateSupportStorage(key,operation==='rollback')))
 const value=await readSupportJson(key)
 if(!value||typeof value.cases!=='object')throw Error('Support verification failed.')
 console.log(JSON.stringify({verified:true,cases:Object.keys(value.cases).length,knowledge:Object.keys(value.knowledge||{}).length,inferenceEnabled:false}))
 process.exitCode=0
}catch{console.error('Support migration or verification failed. Existing routing retained; inspect securely before retry.');process.exitCode=1}
// The imported database pool closes idle connections after its configured timeout.
