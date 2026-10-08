import assert from 'node:assert/strict'
import {POCKET_USDT_ASSETS,POCKET_USDT_NETWORKS,solanaUsdtUnits,supportsPocketUsdt} from '../src/pocket/lib/pocketUsdtAssets.ts'
import {createPocketSolanaRpcHandler} from '../api/pocket/solana-rpc.ts'
assert.deepEqual(POCKET_USDT_NETWORKS,['base','arbitrum','ethereum','polygon','solana'])
assert.equal(supportsPocketUsdt('arc'),false)
assert.equal(supportsPocketUsdt('__proto__'),false)
assert.equal(POCKET_USDT_ASSETS.arbitrum.chainId,42161)
const owner='11111111111111111111111111111111'
const row={pubkey:'token-account',account:{owner:'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',data:{parsed:{info:{owner,mint:POCKET_USDT_ASSETS.solana.address,tokenAmount:{amount:'1234567',decimals:6}}}}}}
assert.equal(solanaUsdtUnits({value:[row]},owner),1234567n)
assert.equal(solanaUsdtUnits({value:[]},owner),0n)
assert.throws(()=>solanaUsdtUnits({value:[row,row]},owner))
assert.throws(()=>solanaUsdtUnits({value:[row]},'another-wallet'))
for(const patch of [{mint:'another-mint'},{tokenAmount:{amount:'1',decimals:9}},{tokenAmount:{amount:'NaN',decimals:6}}]){
 const invalid=structuredClone(row);Object.assign(invalid.account.data.parsed.info,patch)
 assert.throws(()=>solanaUsdtUnits({value:[invalid]},owner))
}
let forwarded=0
const handler=createPocketSolanaRpcHandler({verifyUser:async()=>({userId:'fixture'}),rpcUrl:()=> 'https://rpc.invalid',fetcher:async()=>{forwarded++;return new Response(JSON.stringify({jsonrpc:'2.0',id:1,result:{value:[row]}}))}})
const invoke=async params=>{const res={statusCode:200,status(c){this.statusCode=c;return this},json(b){this.body=b;return this},type(){return this},send(b){this.body=b;return this}};await handler({method:'POST',body:{jsonrpc:'2.0',id:1,method:'getTokenAccountsByOwner',params}},res);return res}
assert.equal((await invoke([owner,{mint:POCKET_USDT_ASSETS.solana.address},{encoding:'jsonParsed',commitment:'confirmed'}])).statusCode,200)
assert.equal((await invoke([owner,{programId:row.account.owner},{encoding:'jsonParsed',commitment:'confirmed'}])).statusCode,400)
assert.equal((await invoke([owner,{mint:'wrong'},{encoding:'jsonParsed',commitment:'confirmed'}])).statusCode,400)
assert.equal(forwarded,1)
console.log('PASS: five USDT deposit networks, Arc exclusion, owner/mint/precision checks, duplicate rejection and bounded authenticated Solana reads.')
