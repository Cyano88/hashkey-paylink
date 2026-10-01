// Read-only. No account, private key, signing or transaction submission.
import {readFile} from 'node:fs/promises'
import {createPublicClient,http} from 'viem'
import {verifyBaseGiftDeployment} from '../api/pocket/gifts/deployment.ts'
const manifestPath=process.argv[2]
if(!manifestPath||!process.env.PRIVATE_RPC_URL){console.error('Usage: PRIVATE_RPC_URL=<Base RPC> node --import tsx scripts/pocket-gifts-deployment-preflight.mjs <reviewed-manifest.json>');process.exitCode=1}
else{try{const manifest=JSON.parse(await readFile(manifestPath,'utf8'));const result=await verifyBaseGiftDeployment(createPublicClient({transport:http(process.env.PRIVATE_RPC_URL,{timeout:10000,retryCount:1})}),manifest);console.log(JSON.stringify(result));console.log('Contract checks passed. This does not enable gifts or verify Circle sponsorship.')}catch{console.error('Gift deployment verification failed. Confirm the manifest and Base RPC configuration.');process.exitCode=1}}
