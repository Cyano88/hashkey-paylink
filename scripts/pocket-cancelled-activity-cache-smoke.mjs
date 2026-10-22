import assert from 'node:assert/strict'
import {mergePocketActivitySnapshot} from '../src/pocket/lib/pocketActivitySnapshot.ts'
const row={eventId:'old',source:'wallet-swap',chain:'arc',providerReference:'cancelled-id',txHash:'',paycrestStatus:'failed',payer:'wallet',amount:'0.5',assetSymbol:'USDC',ts:1}
const previous={payments:[row],merchants:[],collections:[]},incoming={payments:[],merchants:[],collections:[],dismissedSwapApprovalIds:['cancelled-id']}
const cleared=mergePocketActivitySnapshot(previous,incoming)
assert.equal(cleared.payments.length,0)
assert.equal(mergePocketActivitySnapshot(cleared,previous).payments.length,0,'stale snapshot cannot resurrect cancellation')
for(const evidence of [{...row,txHash:'0x'+'a'.repeat(64)},{...row,paycrestStatus:'completed'}])assert.equal(mergePocketActivitySnapshot(cleared,{...previous,payments:[evidence]}).payments.length,1,'real transaction evidence must remain visible')
console.log('PASS cancellation survives Activity cache merge and stale snapshots without hiding transaction evidence')
