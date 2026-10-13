import assert from 'node:assert/strict'
import {readPocketOperations,trackPocketOperation,mergePocketOperations} from '../src/pocket/lib/pocketOperationRecovery.ts'
import {pocketActivityVisibleStatus} from '../src/pocket/lib/pocketActivityPresentation.ts'
class MemoryStorage {getItem(key){return this[key]??null}setItem(key,value){this[key]=value}removeItem(key){delete this[key]}}
const storage=new MemoryStorage()
const pending={quoteToken:'sealed',quote:{id:'a',source:'solana',destination:'base',amount:'2',walletAddress:'wallet'},txHash:'AbC'}
trackPocketOperation('USER@test','bridge',pending,'processing',storage)
assert.equal(readPocketOperations('other@test',storage).length,0)
assert.equal(readPocketOperations('user@test',storage).length,1)
let rows=mergePocketOperations([],readPocketOperations('user@test',storage))
assert.equal(rows[0].assetSymbol,'USDT')
assert.equal(pocketActivityVisibleStatus(rows[0]),'Processing')
trackPocketOperation('user@test','bridge',pending,'failed',storage)
trackPocketOperation('user@test','bridge',pending,'processing',storage)
assert.equal(readPocketOperations('user@test',storage)[0].state,'failed')
rows=mergePocketOperations([],readPocketOperations('user@test',storage))
assert.equal(pocketActivityVisibleStatus(rows[0]),'Bridge failed')
assert.equal(mergePocketOperations([{...rows[0],providerReference:'different',eventId:'different',txHash:'abc'}],readPocketOperations('user@test',storage)).length,2,'Solana signatures are case-sensitive')
assert.equal(mergePocketOperations([{...rows[0],paycrestStatus:'completed'}],readPocketOperations('user@test',storage))[0].paycrestStatus,'completed')
trackPocketOperation('user@test','swap',{quoteToken:'sealed',quote:{id:'b',amount:'3',tokenIn:{symbol:'USDC'},tokenOut:{symbol:'ETH'}}},'failed',storage)
rows=mergePocketOperations([],readPocketOperations('user@test',storage))
assert.equal(pocketActivityVisibleStatus(rows.find(r=>r.source==='wallet-swap')),'Swap failed')
assert.equal(rows.find(r=>r.source==='wallet-swap').amount,'3')
console.log('PASS operation journal: ownership, no-hash activity, terminal preservation, deduplication and Solana case sensitivity')
