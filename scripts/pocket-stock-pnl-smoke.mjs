import assert from 'node:assert/strict'
import {buildStockBasis,stockUnrealizedPnl} from '../src/pocket/lib/pocketStockPnl.ts'
import {historicalClose,purchaseCost} from '../api/pocket/stock-cost-basis.ts'
const asset={symbol:'TESTx',address:'0x1111111111111111111111111111111111111111'},other={symbol:'OTHERx',address:'0x2222222222222222222222222222222222222222'},wallet='0x3333333333333333333333333333333333333333'
const buy=(id,quantity,at)=>({id,hash:id,at,trade:{input:{symbol:'USDC',amount:'100'},output:{symbol:'TESTx',amount:quantity}}})
const sale={id:'sale',hash:'sale',at:3,trade:{input:{symbol:'TESTx',amount:'1'},output:{symbol:'USDC',amount:'80'}}}
const purchases=[buy('a','1',1),buy('b','2',2)],costs={a:'100',b:'100'}
let positions=buildStockBasis([...purchases,sale], [asset],costs)
assert.equal(positions[asset.address].quantity,'2');assert.ok(Math.abs(Number(positions[asset.address].costUsd)-400/3)<1e-12)
const snapshot={complete:true,holdings:[{asset,units:2n*10n**18n,decimals:18}]},quotes={[asset.address]:{usd:80}}
const result=stockUnrealizedPnl(snapshot,{wallet,positions},quotes);assert.ok(Math.abs(result.usd-80/3)<1e-12);assert.ok(Math.abs(result.percent-20)<1e-12)
assert.deepEqual(buildStockBasis([...purchases,purchases[0],{...purchases[0],id:'duplicate'},sale],[asset],costs),positions,'Duplicate notices and transaction hashes cannot inflate basis')
const raw={id:'raw',hash:'a',at:1,transfer:{token:asset.address,symbol:asset.symbol,amount:'1',direction:'in'}}
assert.deepEqual(buildStockBasis([...purchases,sale,raw],[asset],costs),positions,'Trade transfer leg is counted once')
const gift={...raw,id:'gift',hash:'gift',at:4}
positions=buildStockBasis([...purchases,sale,gift],[asset],costs);assert.equal(positions[asset.address].costUsd,null,'Unknown incoming cost is never profit')
assert.equal(stockUnrealizedPnl(snapshot,{wallet,positions},quotes),null)
assert.equal(stockUnrealizedPnl({...snapshot,complete:false},{wallet,positions},quotes),null)
assert.equal(stockUnrealizedPnl(snapshot,{wallet,positions:buildStockBasis(purchases,[asset],costs)},quotes),null,'Unreconciled shares cannot produce a return')
assert.equal(stockUnrealizedPnl({...snapshot,holdings:[...snapshot.holdings,{asset:other,units:1n,decimals:18}]},{wallet,positions:buildStockBasis([...purchases,sale],[asset],costs)},quotes),null,'Never present a partial portfolio as a total')
assert.equal(buildStockBasis([buy('tiny','0.000000000000000001',1)],[asset],{tiny:'0.01'})[asset.address].quantity,'0.000000000000000001')
const client={getTransactionReceipt:async()=>({status:'success',from:'relayer',blockNumber:10n,blockHash:'block',gasUsed:100n,effectiveGasPrice:10n}),getBlock:async()=>({hash:'block',timestamp:100n})}
const n={...buy('a','1',1),trade:{...buy('a','1',1).trade,feeAmount:'0.01',serviceFeeAmount:'0.25'}}
assert.equal(Number(await purchaseCost(n,wallet,client,()=>{throw Error('Unnecessary price request')})),100.01,'Service fee included once and reimbursement added once')
const native={...n,trade:{...n.trade,input:{symbol:'OKB',amount:'0.5'},feeAmount:undefined}}
const direct={...client,getTransactionReceipt:async()=>({...await client.getTransactionReceipt(),from:wallet,gasUsed:1000000000000000n,effectiveGasPrice:1n})}
assert.equal(Number(await purchaseCost(native,wallet,direct,async()=>50)),25.05,'Native purchase and actual gas use historical price')
await assert.rejects(()=>purchaseCost(native,wallet,client),/Unknown reimbursement/)
assert.equal(historicalClose([['60000','1','2','1','1.5','10','15','1']],70000),1.5)
assert.throws(()=>historicalClose([['0','1','2','1','1.5','10','15','1']],70000),/Missing/)
assert.throws(()=>historicalClose([['60000','1','2','1','1.5','10','15','0']],70000),/Missing/)
console.log('PASS stock P&L: average cost, partial sale, duplicate legs, tiny shares, incomplete history, portfolio reconciliation, fee accounting, historical native cost and candle freshness')

assert.equal(historicalClose([['60000','1','2','1','1.5','10','15','15','1']],70000,9),1.5)

const closed=buildStockBasis([buy('unknown','1',1),{...sale,at:2},buy('fresh','1',3)],[asset],{fresh:'50'});assert.equal(closed[asset.address].costUsd,'50','Fully disposed shares do not poison the cost of a later position')
