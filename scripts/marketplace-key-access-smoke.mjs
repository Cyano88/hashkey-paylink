import assert from 'node:assert/strict'
import {marketplaceKeyPolicy} from '../api/marketplace/key-access.ts'
const project={id:'project_one',ownerId:'owner_one',capabilities:['marketplace_payments'],accountType:'individual',operationalStatus:'active'},access=[{projectId:'project_one',ownerId:'owner_one',status:'approved'}]
assert.equal(marketplaceKeyPolicy(project,access,'advanced'),true)
assert.equal(marketplaceKeyPolicy(project,access,'basic'),true)
for(const patch of [{accountType:'business'},{operationalStatus:'suspended'},{removal:{}},{capabilities:['marketplace_payments','hosted_checkout']},{businessVerification:{status:'rejected'}},{ownerId:'other_owner'}])assert.equal(marketplaceKeyPolicy({...project,...patch},access,'advanced'),false)
for(const requests of [[],[...access,...access],[{...access[0],status:'pending'}],[{...access[0],status:'rejected'}]])assert.equal(marketplaceKeyPolicy(project,requests,'advanced'),false)
assert.equal(marketplaceKeyPolicy(project,access,'none'),false)
assert.equal(marketplaceKeyPolicy({...project,accountType:'business',businessVerification:{status:'approved'}},access,'none'),true)
console.log('PASS Marketplace-only key policy: current individual KYC or approved business, unique approval, active owner, no checkout capability bypass.')
