import assert from 'node:assert/strict'
import {routeCirclePocketQuestion} from '../api/pocket/agent-router.ts'
for(const [message,capability,url] of [
 ['bill Chioma 12 USDC for design work','receive-usdc','/move/usdc'],
 ['pay my electricity bill','bills','/bills/electricity'],
 ['buy airtime','bills','/bills/airtime'],
 ['show my receipts','receipts','/activity'],
 ['show my wallet balance','wallet-overview','/home'],
 ['set up a contactless terminal for my shop','retail-pos','/move/pos'],
]) {
 const result=routeCirclePocketQuestion(message,'circle-pocket')
 assert.equal(result.supported,true,message);assert.equal(result.capability,capability,message);assert.equal(result.action.url,url,message)
}
assert.equal(routeCirclePocketQuestion('write a match report','circle-pocket').supported,false)
console.log('Pocket assistant routing passed: USDC requests, utility bills, receipts, balances, POS and out-of-scope handling')
