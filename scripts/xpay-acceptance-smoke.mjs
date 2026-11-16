import assert from 'node:assert/strict'
import {normalizeXPayAcceptance,reconcileXPayAcceptance,xpayAvailableRoutes} from '../src/pocket/lib/xpayAcceptance.ts'
const wallet={id:'wallet',name:'Shop',kind:'stablecoins',currency:'USDC',assets:['USDC','USDT'],networks:['base','arbitrum','arc','solana'],revision:'1'}
const bank={id:'bank',name:'Shop',kind:'bank',currency:'NGN',assets:['USDC'],networks:['base'],revision:'1'}
const all=normalizeXPayAcceptance(undefined,[wallet,bank])
assert.equal(all.routes.length,5)
assert.ok(all.routes.every(r=>r.asset==='USDC'))
assert.equal(all.cashBalance,false)
const restricted=normalizeXPayAcceptance({...all,routes:all.routes.filter(r=>r.network==='arbitrum'||r.destinationId==='bank')},[wallet,bank])
const revised={...wallet,revision:'2',networks:[...wallet.networks,'polygon']}
assert.throws(()=>normalizeXPayAcceptance(restricted,[revised,bank]))
const migrated=reconcileXPayAcceptance(restricted,[revised,bank])
assert.deepEqual(migrated.routes.filter(r=>r.destinationId==='wallet').map(r=>[r.network,r.revision]),[['arbitrum','2']])
assert.throws(()=>reconcileXPayAcceptance(restricted,[{...wallet,networks:['base']},bank]))
assert.deepEqual(reconcileXPayAcceptance(restricted,[]).routes,[])
const replacement={...wallet,id:'replacement'}
assert.equal(reconcileXPayAcceptance(restricted,[replacement]).routes.length,4)
assert.deepEqual(xpayAvailableRoutes([{...wallet,kind:'xstocks',assets:['NVDAx'],networks:['xlayer']}]),[])
assert.deepEqual(xpayAvailableRoutes([{...wallet,networks:['invented-chain']}]),[])
assert.throws(()=>normalizeXPayAcceptance({...all,routes:[{...all.routes[0],recipient:'injected'}]},[wallet]))
assert.throws(()=>normalizeXPayAcceptance({...all,routes:[{...all.routes[0],network:'__proto__'}]},[wallet]))
console.log('PASS acceptance migration preserves restrictions, revision binding, route capability boundaries and legacy stock separation.')
