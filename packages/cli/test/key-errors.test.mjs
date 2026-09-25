import {test} from 'node:test'
import assert from 'node:assert/strict'
import {keysApi} from '../src/key-management.mjs'
const session={token:'fixture-only',grant:{projectId:'fixture-project'}}
test('key configuration failures explain the missing product without exposing server output',async()=>{
 for(const [error,expected]of [
  ['Select a Swap network in project settings before creating a Swap key.',/under Swap/],
  ['xStocks Agreement keys require the separate xStocks Agreements capability.',/under Agreements/],
  ['secret-provider-response-fixture',/^Key operation failed/]
 ])await assert.rejects(keysApi({action:'create'},{session,fetcher:async()=>Response.json({ok:false,error},{status:409})}),reason=>expected.test(reason.message)&&!reason.message.includes('secret-provider-response-fixture'))
})
