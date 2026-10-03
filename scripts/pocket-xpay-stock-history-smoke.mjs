import assert from 'node:assert/strict'
import {xpayStockHistory,xpayStockTotals} from '../src/pocket/lib/pocketXPayStockHistory.ts'
const row={id:'one',rail:'xstocks',network:'xlayer',asset:'NVDAx',state:'successful',amount:'0.1',createdAt:1}
const rows=[row,{...row,id:'two',amount:'0.2'},{...row,id:'tiny',amount:'0.000000000000000001'},row,{...row,id:'other',asset:'AAPLx',amount:'2'},...['pending','failed','refunded'].map(state=>({...row,id:state,state,amount:'100'})),{...row,id:'cash',asset:'USDC'},{...row,id:'bank',rail:'stablecoins',asset:'NGN'},{...row,id:'wrong-network',network:'base'}]
assert.deepEqual(xpayStockTotals(rows),[{symbol:'AAPLx',amount:'2'},{symbol:'NVDAx',amount:'0.300000000000000001'}])
assert.equal(xpayStockHistory(rows).some(p=>['USDC','NGN'].includes(p.asset)),false)
assert.equal(xpayStockHistory(rows).filter(p=>p.state==='pending').length,1)
assert.deepEqual(xpayStockTotals([{...row,amount:'NaN'},{...row,id:'negative',amount:'-1'}]),[])
assert.equal(xpayStockTotals(Array.from({length:205},(_,i)=>({...row,id:String(i),amount:'1'})))[0].amount,'205')
console.log('PASS stock-only receipt scope, exact per-stock totals, confirmed-only counting, replay deduplication and totals beyond the history display limit.')
