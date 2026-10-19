import {pocketExchangeNotification} from '../src/pocket/lib/pocketExchangeNotification.ts'
import assert from 'node:assert/strict'
import {pocketMoneyNotification as notice} from '../src/pocket/lib/pocketMoneyNotification.ts'
const networks={arc:'Arc',ethereum:'Ethereum',base:'Base',arbitrum:'Arbitrum',polygon:'Polygon',solana:'Solana',xlayer:'X Layer'}
for(const [chain,label] of Object.entries(networks))for(const assetSymbol of ['USDC','USDT']){
 const row={eventId:'swap-1',source:'wallet-swap',chain,assetSymbol,amount:'0.5',contextLabel:`0.5 ${assetSymbol} to 0.000512345678 SOL`,txHash:'verified',ts:1,paycrestStatus:'completed'}
 const n=notice(row);assert.equal(n.title,'Swap successful');assert.equal(n.body,`0.5 ${assetSymbol} swapped for 0.000512346 SOL on ${label}.`);assert.ok(!n.body.includes('undefined'));assert.equal(n.eventId,notice({...row}).eventId)
 for(const status of ['processing','pending','submitted','confirmed','awaiting_approval','needs_attention'])assert.equal(notice({...row,paycrestStatus:status}),null)
 const failed=notice({...row,paycrestStatus:'failed'});assert.equal(failed.title,'Swap failed');assert.ok(!failed.body.includes('SOL'));assert.ok(!failed.body.includes('completed. 0.'))
 for(const contextLabel of ['0.5 USDT to undefined SOL','0.6 USDT to 0.005 SOL','0.5 BAD to 0.005 SOL'])assert.equal(notice({...row,contextLabel}).body,`Your swap on ${label} completed.`)
 assert.equal(notice({...row,txHash:''}),null);assert.equal(notice({...row,fundingParent:'bill:1'}),null)
 for(const destination of Object.keys(networks).filter(n=>n!==chain)){
  const bridge={...row,source:'wallet-bridge',destination};assert.match(notice(bridge).body,new RegExp(`from ${label} to ${networks[destination]}`));assert.equal(notice({...bridge,paycrestStatus:'confirmed'}),null);assert.equal(notice({...bridge,paycrestStatus:'processing'}),null);assert.equal(notice({...bridge,paycrestStatus:'failed'}).title,'Bridge failed');assert.match(notice({...bridge,paycrestStatus:'refunded',refundAsset:assetSymbol,refundAmount:'0.49',refundNetwork:chain}).body,new RegExp(`0.49 ${assetSymbol} returned to your ${label}`));
 }
}
console.log('PASS all seven networks, both stablecoins, bridge routes, precise output display, malformed context, status gates, refunds, stable dedup IDs and silent funding')

const cashRow={eventId:'pocket-bridge:cash',source:'wallet-bridge',chain:'arc',destination:'base',assetSymbol:'USDC',amount:'0.5',txHash:'0xcash',paycrestStatus:'completed',activityLabel:'Cash funding',ts:1}
assert.equal(pocketExchangeNotification(cashRow).title,'Added to cash balance')
assert.equal(pocketExchangeNotification({...cashRow,paycrestStatus:'processing'}),null)
assert.equal(pocketExchangeNotification({...cashRow,activityLabel:'USDC bridge'}).title,'Bridge successful')
