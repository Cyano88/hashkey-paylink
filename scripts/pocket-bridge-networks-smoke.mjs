import assert from 'node:assert/strict'
import {POCKET_BRIDGE_NETWORKS,pocketBridgeNetworkLabel,pocketBridgeDestinations,savedPocketBridgeNetwork} from '../src/pocket/lib/pocketBridgeNetworks.ts'
import {CCTP_DOMAIN} from '../api/pocket/cctp.ts'
assert.equal(POCKET_BRIDGE_NETWORKS.length,6)
for(const source of POCKET_BRIDGE_NETWORKS){
 assert.equal(savedPocketBridgeNetwork(source),source)
 const destinations=pocketBridgeDestinations(source)
 assert.equal(destinations.length,5)
 assert.ok(!destinations.includes(source))
 for(const destination of destinations){assert.notEqual(CCTP_DOMAIN[source],CCTP_DOMAIN[destination]);assert.ok(Number.isInteger(CCTP_DOMAIN[destination]))}
}
assert.equal(pocketBridgeNetworkLabel('ethereum'),'Ethereum')
assert.equal(pocketBridgeNetworkLabel('polygon'),'Polygon')
assert.equal(savedPocketBridgeNetwork('xlayer'),'base')
console.log('Bridge network matrix: 30 directed routes, labels and saved selections passed')
