// Read-only: never imports a wallet, private key, or transaction broadcaster.
import {readFile} from 'node:fs/promises'
import {createPublicClient,http} from 'viem'
import {verifyMultiGiftDeployment} from '../api/pocket/gifts/multi-preflight.ts'
try{
 const path=process.argv[2];if(!path)throw Error('Manifest required.')
 const manifest=JSON.parse(await readFile(path,'utf8'))
 const url=manifest.network==='xlayer'?process.env.XLAYER_RPC_URL||'https://rpc.xlayer.tech':manifest.network==='base'?process.env.PRIVATE_RPC_URL:undefined
 if(!url)throw Error('Supported network RPC required.')
 console.log(JSON.stringify(await verifyMultiGiftDeployment(createPublicClient({transport:http(url,{timeout:10000,retryCount:1})}),manifest)))
 console.log('Read-only checks passed. Activation and native wallet verification are separate steps.')
}catch{console.error('Multi-gift preflight failed. Check the reviewed manifest, deployed contract, token and network. No transaction was sent.');process.exitCode=1}
