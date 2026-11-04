import assert from 'node:assert/strict'
import {mergeSendActivity} from '../src/pocket/lib/pocketSendAttempts.ts'
import {mergePocketOperations} from '../src/pocket/lib/pocketOperationRecovery.ts'
import {mergePocketActivityRows} from '../src/pocket/lib/pocketActivitySnapshot.ts'
const hash='0x'+'1'.repeat(64),row={eventId:'send-event',txHash:hash,chain:'base',payer:'owner',recipient:'recipient',amount:'1',assetSymbol:'USDC',memo:'Sent',ts:1,source:'wallet-withdrawal',direction:'out',paycrestStatus:'processing'}
const send={owner:'owner',idempotencyKey:'one',network:'base',sourceAddress:'owner',recipient:'recipient',amount:'1',asset:'USDC',txHash:hash,state:'confirmed',context:'send',createdAt:1}
for(const source of ['wallet-withdrawal','wallet-transfer'])assert.equal(mergeSendActivity([{...row,source}],[send])[0].paycrestStatus,'confirmed')
for(const source of ['bank-withdrawal','bills','request'])assert.equal(mergeSendActivity([{...row,source}],[send])[0].paycrestStatus,'processing')
for(const source of ['wallet-withdrawal','wallet-transfer','wallet-swap','wallet-bridge']){
 const terminal={...row,source,paycrestStatus:'confirmed'}
 assert.equal(mergePocketActivityRows([terminal],[{...row,source}])[0].paycrestStatus,'confirmed','Late pending response must not regress '+source)
}
for(const kind of ['bridge','swap'])for(const status of ['confirmed','completed','successful','refunded','failed']){
 const source=kind==='bridge'?'wallet-bridge':'wallet-swap',chain=kind==='bridge'?'base':'arc';const op={id:kind+':q',owner:'owner',kind,state:'processing',createdAt:1,pending:{txHash:hash,quoteToken:'saved',quote:{id:'q',source:chain,destination:'polygon',amount:'1',tokenIn:{symbol:'USDC'},tokenOut:{symbol:'USDT'}}}}
 assert.equal(mergePocketOperations([{...row,source,chain,providerReference:'q',paycrestStatus:status}],[op])[0].paycrestStatus,status)
}
console.log('PASS Base USDC send proof advances ordinary transfers only; stale server/local responses cannot regress confirmed Send/Swap/Bridge activity. No second transfer required.')
