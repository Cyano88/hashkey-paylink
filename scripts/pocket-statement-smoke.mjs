import assert from 'node:assert/strict'
import { pocketStatementCsv, statementRows } from '../src/pocket/lib/pocketStatement.ts'
const base={eventId:'fixture',txHash:'',chain:'base',payer:'',memo:'',amount:'2.25',ts:Date.UTC(2026,8,21),source:'purchase',direction:'out',paycrestStatus:'pending'}
const csv=pocketStatementCsv([{...base,activityLabel:'=HYPERLINK("example")'}, {...base,eventId:'hidden',source:'pos',direction:'in'}, {...base,activityLabel:'Comma, quote " and\nnewline',paycrestStatus:'failed'}])
assert.ok(csv.startsWith('\uFEFF'))
assert.ok(csv.includes("'="))
assert.ok(csv.includes('"Comma, quote "" and newline"'))
assert.ok(!csv.includes('"hidden"'))
assert.ok(csv.includes('"Processing"')&&csv.includes('"Failed"'))
assert.ok(csv.includes('"-2.25"'))
console.log('PASS CSV escaping, formula protection, status preservation and incoming POS exclusion.')

const dated=day=>({...base,ts:new Date(2026,8,day,23,59,59).getTime()})
assert.equal(statementRows([dated(20),dated(21),dated(22)],{from:'2026-09-21',to:'2026-09-21'}).length,1)
assert.throws(()=>statementRows([],{from:'2026-09-22',to:'2026-09-21'}))
const isolated=pocketStatementCsv([{...base,eventId:'collection-private',source:'collection',txHash:'same'}, {...base,eventId:'raw-private',source:'wallet-deposit',txHash:'same'},base])
assert.ok(!isolated.includes('collection-private')&&!isolated.includes('raw-private'))
assert.ok(pocketStatementCsv([{...base,amountNgn:'20',fiatCurrency:'UGX'}]).includes('UGX'))
console.log('PASS inclusive local-date boundaries, reversed range validation, collection isolation and local currencies')

assert.equal(statementRows([{...base,source:'request',paycrestStatus:'pending',txHash:'submitted-hash'}]).length,1)
assert.equal(statementRows([{...base,source:'request',paycrestStatus:'awaiting response',txHash:''}]).length,0)

const local={...base,source:'bills',billCategory:'airtime',memo:'Paycrest VTpass routing',amountNgn:'1000',fiatCurrency:'NGN'};const bank={...base,source:'bank-withdraw',accountName:'Fixture Recipient'};assert.equal(statementRows([local,bank,base],{kind:'local'}).length,2);assert.equal(statementRows([{...base,fundingOnly:true}]).length,0);const clean=pocketStatementCsv([local]);assert.ok(clean.includes('Airtime purchase'));assert.ok(!clean.includes('Paycrest')&&!clean.includes('Transaction hash')&&!clean.includes('Direction'));assert.ok(clean.includes('21-09-26'));assert.ok(clean.includes('"-2.25"'));console.log('PASS clean labels, signed amounts, local-rail scope and grouped funding exclusion.');

const {pocketActivityReference,pocketActivityReceipt}=await import('../src/pocket/lib/pocketReceipt.ts');
const {statementTotals}=await import('../src/pocket/lib/pocketStatementPresentation.ts');
for(const refs of [{providerReference:'provider-123',billReference:'bill-123',txHash:'chain-123'},{billReference:'bill-123',txHash:'chain-123'},{txHash:'chain-123'},{}]){
 const row={...base,source:'bills',paycrestStatus:'confirmed',...refs};const receipt=pocketActivityReceipt(row);
 assert.equal(pocketActivityReference(row),receipt.referenceId);assert.ok(pocketStatementCsv([row]).includes('"'+receipt.referenceId+'"'));
}
const confirmed={...base,paycrestStatus:'confirmed'};
assert.deepEqual(statementTotals([{...confirmed,direction:'in',amount:'0.1'},{...confirmed,direction:'in',amount:'0.2'},confirmed,{...confirmed,amount:'500',paycrestStatus:'failed'},{...confirmed,paycrestStatus:'refunded'},{...confirmed,assetSymbol:'NVDAx'},{...confirmed,source:'wallet-bridge'},{...confirmed,fundingOnly:true}]),{incoming:'0.3',outgoing:'2.25'});
console.log('PASS receipt reference parity and exact confirmed-only USDC totals; mixed assets, refunds and internal funding excluded.');
