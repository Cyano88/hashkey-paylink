import assert from 'node:assert/strict'
import { mergePocketActivityRows } from '../src/pocket/lib/pocketActivitySnapshot.ts'
const row={eventId:'bank-fixture',txHash:'0x'+'1'.repeat(64),chain:'base',payer:'',memo:'',amount:'1',ts:1,source:'bank-withdraw',direction:'out',paycrestStatus:'settled'}
const missing={...row,paycrestStatus:undefined}
assert.equal(mergePocketActivityRows([row],[missing])[0].paycrestStatus,'settled')
assert.equal(mergePocketActivityRows([row],[{...row,paycrestStatus:'refunded'}])[0].paycrestStatus,'refunded')
assert.equal(mergePocketActivityRows([{...row,paycrestStatus:'successful'}],[{...row,paycrestStatus:'pending'}])[0].paycrestStatus,'pending')
console.log('PASS missing status preserves last observation; explicit provider updates replace it.')
