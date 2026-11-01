import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {validateBscRelayQuote,RELAY_BSC_CHAINS} from '../api/pocket/bsc-bridge-provider.ts'
import {validateRelayStablecoinQuote} from '../api/pocket/xlayer-bridge-provider.ts'
import {reconcileSolanaExternalBridge} from '../api/pocket/solana-external-bridge-settlement.ts'
for(const file of readdirSync('scripts/fixtures/inbound-bridge').filter(n=>n.endsWith('.json'))){
 const {input:i,response,now}=JSON.parse(readFileSync('scripts/fixtures/inbound-bridge/'+file,'utf8'));if(i.source!=='solana')continue
 const q=i.destination==='bsc'?validateBscRelayQuote(response,i,now):validateRelayStablecoinQuote(response,i,now,{allowXLayerUsdcRefund:true})
 const hash='0x'+'b'.repeat(64);let received=null,ledger=0
 let record={id:'test',ownerId:'owner',walletAddress:i.sender,destinationAddress:i.recipient,quote:q,signature:'3'.repeat(88),phase:'source_confirmed'}
 const sourceId=RELAY_BSC_CHAINS.solana.id,destId=RELAY_BSC_CHAINS[i.destination].id
 const status={status:'success',originChainId:sourceId,destinationChainId:destId,inTxHashes:[record.signature],txHashes:[hash]}
 const request={id:q.requestId,protocol:{orderId:q.orderId,hubType:'onchain'},status:'success',user:i.sender,recipient:i.recipient,data:{inTxs:[{txHash:record.signature,chainId:sourceId,status:'success'}],outTxs:[{txHash:hash,chainId:destId,status:'success'}]}}
 const deps={store:{read:async()=>record,update:async(_id,fn)=>record=fn(record)},apiKey:()=> 'fixture',now:()=>now,ledger:async()=>{ledger++},received:async()=>received,fetch:async url=>({ok:true,json:async()=>url.includes('/intents/')?status:{requests:[request]}})}
 assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'pending');assert.equal(ledger,0)
 received=1n;assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'needs_attention')
 received=BigInt(q.receiveUnits);assert.equal((await reconcileSolanaExternalBridge('owner','test',deps)).status,'completed');assert.equal(record.settlement.amountUnits,q.receiveUnits)
 await assert.rejects(()=>reconcileSolanaExternalBridge('other','test',deps),/not found/)
 console.log('PASS canonical Solana external settlement '+file)
}
