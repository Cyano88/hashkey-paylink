// Read-only source/destination hub probe. Run with node --import tsx.
// This deliberately tests direct deposits only; combined conversion legs are
// captured and validated separately. A successful quote is not a funded test.
import {Keypair} from '@solana/web3.js'
import {writeFileSync,mkdirSync} from 'node:fs'
import {crossBridgeAssets,CROSS_BRIDGE_NETWORKS} from '../src/pocket/lib/pocketCrossBridgeAssets.ts'
import {crossBridgeRelayRequest,validateCrossBridgeRelayQuote} from '../api/pocket/cross-bridge-provider.ts'
const wallet=n=>n==='solana'?Keypair.fromSeed(new Uint8Array(32).fill(42)).publicKey.toBase58():'0x1111111111111111111111111111111111111111'
const rows=[]
for(const source of CROSS_BRIDGE_NETWORKS)for(const token of crossBridgeAssets(source))rows.push({source,destination:source==='base'?'arbitrum':'base',from:token.symbol,to:'USDC',token})
for(const destination of CROSS_BRIDGE_NETWORKS)for(const token of crossBridgeAssets(destination))rows.push({source:destination==='base'?'arbitrum':'base',destination,from:'USDC',to:token.symbol,token:{decimals:6,native:false}})
const results=[]
for(const {token,...pair} of rows){
 const amountUnits=String(token.native?10n**BigInt(token.decimals)/100n:10n*10n**BigInt(token.decimals)),input={...pair,sender:wallet(pair.source),recipient:wallet(pair.destination),amountUnits},now=Date.now()
 let limited=false
 try{
  const response=await fetch('https://api.relay.link/quote/v2',{method:'POST',headers:{'content-type':'application/json',...(process.env.RELAY_API_KEY?{'x-api-key':process.env.RELAY_API_KEY}:{})},body:JSON.stringify(crossBridgeRelayRequest(input,null)),signal:AbortSignal.timeout(20000)})
  const body=await response.json();let validated=false,error
  if(response.ok)try{validateCrossBridgeRelayQuote(body,input,now,null);validated=true}catch(e){error=e.message}
  limited=response.status===429
  results.push({...pair,amountUnits,status:response.status,code:body.errorCode,validated,error})
 }catch(e){results.push({...pair,amountUnits,error:e.message})}
 console.log(JSON.stringify(results.at(-1)))
 mkdirSync('output/bridge-swap-audit-20261105',{recursive:true})
 writeFileSync('output/bridge-swap-audit-20261105/live-hub-coverage.json',JSON.stringify({at:new Date().toISOString(),scope:'Direct deposits only; combined conversions tested separately; no signing or broadcasting',results},null,2))
 if(limited){console.log('Stopped on provider rate limit; resume only after cooldown.');break}
 await new Promise(resolve=>setTimeout(resolve,1500))
}
