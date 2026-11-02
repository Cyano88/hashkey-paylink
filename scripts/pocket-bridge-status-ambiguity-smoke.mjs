import assert from 'node:assert/strict'
import {readCircleBridgeStatus} from '../api/pocket/circle-bridge-status.ts'
for(const source of ['base','arbitrum','arc','solana','ethereum','polygon']){
 const fetcher=messages=>async(url,options)=>{assert.ok(options.signal);return new Response(JSON.stringify({messages}))}
 assert.equal((await readCircleBridgeStatus(source,'fixture',fetcher([{status:'complete'}]))).status,'attested')
 assert.equal((await readCircleBridgeStatus(source,'fixture',fetcher([{forwardState:'confirmed',forwardTxHash:'0x'+'1'.repeat(64)}]))).status,'confirmed')
 await assert.rejects(readCircleBridgeStatus(source,'fixture',fetcher([{forwardState:'confirmed'},{forwardState:'pending'}])),/ambiguous/)
}
console.log('PASS six CCTP networks: bounded status request, attestation is not delivery, ambiguous messages cannot claim completion')
