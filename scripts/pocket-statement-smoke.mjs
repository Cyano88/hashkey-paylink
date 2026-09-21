import assert from 'node:assert/strict'
import { pocketStatementCsv } from '../src/pocket/lib/pocketStatement.ts'
const base={eventId:'fixture',txHash:'',chain:'base',payer:'',memo:'',amount:'2.25',ts:Date.UTC(2026,8,21),source:'wallet-withdrawal',direction:'out',paycrestStatus:'pending'}
const csv=pocketStatementCsv([{...base,activityLabel:'=HYPERLINK("example")'}, {...base,eventId:'hidden',source:'pos',direction:'in'}, {...base,activityLabel:'Comma, quote " and\nnewline',paycrestStatus:'failed'}])
assert.ok(csv.startsWith('\uFEFF'))
assert.ok(csv.includes("'="))
assert.ok(csv.includes('"Comma, quote "" and newline"'))
assert.ok(!csv.includes('"hidden"'))
assert.ok(csv.includes('"pending"')&&csv.includes('"failed"'))
assert.ok(csv.includes('"2.25"'))
console.log('PASS CSV escaping, formula protection, status preservation and incoming POS exclusion.')
