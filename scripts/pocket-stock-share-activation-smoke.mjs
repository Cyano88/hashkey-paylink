import assert from 'node:assert/strict'
import {activeStockGiftDeployments,stockGiftDeployments} from '../api/pocket/gifts/multi-deployment.ts'
import {sameGiftDeployment} from '../api/pocket/gifts/deployment.ts'
import {createGiftService} from '../api/pocket/gifts/service.ts'
const active=activeStockGiftDeployments(),all=stockGiftDeployments()
assert.equal(active.length,1);assert.equal(active[0].asset.symbol,'NVDAx');assert.equal(active[0].accounting,'shares-v1')
const legacy=all.find(d=>d.token.toLowerCase()===active[0].token.toLowerCase()&&!d.accounting)
assert.ok(legacy);assert.equal(sameGiftDeployment(active[0],legacy),false)
assert.ok(all.some(d=>sameGiftDeployment(d,legacy)),'old links retain their pinned deployment')
const service=createGiftService({store:{read:async()=>({id:'old',ownerId:'sender',deployment:legacy,maxClaims:2})},deployment:()=>active[0]})
await assert.rejects(()=>service.authorize({userId:'sender',handle:'shy'},'old','funding','xstocks'),/Create a new stock gift/)
console.log('PASS activation: only reviewed NVDAx receives new funding; old deployments stay observable; old drafts cannot fund the replacement implicitly.')
