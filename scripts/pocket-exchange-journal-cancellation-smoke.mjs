import assert from 'node:assert/strict'
import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
const dir=await mkdtemp(join(tmpdir(),'pocket-exchange-journal-'))
process.env.CIRCLE_POCKET_ACTION_STORE=join(dir,'actions.json')
const {recordCirclePocketAction:write}=await import('../api/circle-pocket-action-journal.ts')
try{for(const action of ['wallet.native-swap','wallet.cash-conversion','wallet.bsc-swap','wallet.usdt-bridge','wallet.xlayer-bridge','wallet.bsc-bridge']){
 const base={ownerId:'fixture',idempotencyKey:action,action,metadata:{quoteToken:'fixture',source:'solana',destination:'base',amount:'1'}}
 await write({...base,status:'submitted'});await write({...base,status:'cancelled'})
 assert.equal((await write({...base,status:'submitted'})).status,'cancelled')
 assert.equal((await write({...base,status:'submitted',metadata:{...base.metadata,txHash:'signature',signedTransaction:'signed',submissionClaim:'true'}})).status,'cancelled')
 const proof={...base,metadata:{...base.metadata,txHash:'signature'}}
 await write({...proof,status:'submitted'})
 assert.equal((await write({...base,status:'cancelled'})).status,'submitted')
 await write({...proof,status:'completed'});assert.equal((await write({...base,status:'cancelled'})).status,'completed')
 console.log('PASS '+action+': stale responses cannot revive cancellation, local submit loses, actual transaction evidence wins.')
}}finally{await rm(dir,{recursive:true,force:true})}
