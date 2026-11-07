import assert from 'node:assert/strict'
import {checkoutRailEnabled} from '../api/checkout-rail-rollout.ts'
for(const [network,prefix] of [['bsc','HASHPAYLINK_BSC_CHECKOUT'],['xlayer','HASHPAYLINK_XSTOCKS_CHECKOUT']]){
 const env={[prefix+'_ENABLED']:'true',[prefix+'_PROJECTS']:' dev_one,dev_two '}
 assert.equal(checkoutRailEnabled(network,'dev_one',env),true)
 assert.equal(checkoutRailEnabled(network,'dev_two',env),true)
 assert.equal(checkoutRailEnabled(network,'dev',env),false)
 assert.equal(checkoutRailEnabled(network,'dev_three',env),false)
 assert.equal(checkoutRailEnabled(network,'dev_one',{...env,[prefix+'_ENABLED']:'false'}),false)
 assert.equal(checkoutRailEnabled(network,'dev_one',{}),false)
}
console.log('PASS checkout and portal share exact per-project rollout matching; global off and missing configuration remain disabled.')
