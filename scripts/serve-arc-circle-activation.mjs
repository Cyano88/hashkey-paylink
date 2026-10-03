import {createServer} from 'node:http'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
import {build} from 'vite'
import {nodePolyfills} from 'vite-plugin-node-polyfills'
import {createPublicClient,http} from 'viem'

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),host='127.0.0.1:4390',origin='http://'+host
const record=JSON.parse(readFileSync(resolve(root,'.codex-temp/arc-circle-canary-wallets.json'),'utf8'))
const seller=record.wallets.find(wallet=>wallet.role==='seller')
if(!seller||seller.blockchain!=='ARC'||seller.accountType!=='SCA')throw Error('Verified seller Circle wallet is required.')
const journal=resolve(root,'.codex-temp/arc-circle-seller-activation.json')
const expected={email:seller.email,walletId:seller.walletId,address:seller.address}
const upstream='https://hashkey-paylink.onrender.com'
const client=createPublicClient({transport:http('https://rpc.mainnet.arc.io',{timeout:15000,retryCount:1})})
const bundle=await build({configFile:false,root,envFile:false,plugins:[nodePolyfills({globals:{Buffer:true,global:true,process:true},protocolImports:true})],define:{'import.meta.env':'{}'},logLevel:'error',build:{write:false,minify:true,lib:{entry:resolve(root,'scripts/arc-circle-activation-client.js'),name:'CircleActivation',formats:['iife']},rollupOptions:{output:{inlineDynamicImports:true}}}})
const clientCode=(Array.isArray(bundle)?bundle:[bundle]).flatMap(result=>result.output).find(file=>file.type==='chunk'&&file.isEntry).code
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink - Circle Arc activation</title><link rel="stylesheet" href="/style.css"></head><body><main><p>HASH PAYLINK - ARC MAINNET</p><h1>Activate the seller wallet</h1><p>Use the existing Circle email and confirmation flow. This requests a zero-USDC transfer to the same wallet to initialize it. The 0.1 USDC Trade test has not started.</p><dl><dt>Seller email</dt><dd id="email"></dd><dt>Existing Arc wallet</dt><dd id="wallet"></dd><dt>Transfer</dt><dd>0 USDC to the same wallet</dd></dl><button id="connect" disabled>Sign in with Circle</button><button id="activate" disabled>Review wallet activation</button><button id="refresh">Check activation</button><pre id="status" role="status">Loading wallet details...</pre><p id="result"></p></main><script src="/client.js"></script></body></html>`
const style=readFileSync('C:/Users/USER/Desktop/Hash-PayLink-Arc-Mainnet-Deployment/style.css')
const allowed=new Set(['requestEmailOtp','listWallets','getChallenge','getTransaction','deployEvmWallet'])
const save=value=>writeFileSync(journal,JSON.stringify(value,null,2)+'\n')
createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY')
 // Circle's existing SDK manages its authenticated cross-origin iframe; no
 // session tokens or encryption keys are logged or written by this server.
 if(req.headers.host!==host){res.writeHead(403).end();return}
 const reply=(status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(body))}
 try{
  if(req.method==='GET'){
   if(req.url==='/'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);return}
   if(req.url==='/style.css'){res.setHeader('Content-Type','text/css');res.end(style);return}
   if(req.url==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(clientCode);return}
   if(req.url==='/expected'){reply(200,expected);return}
   if(req.url==='/status'){
    if(await client.getChainId()!==5042)throw Error()
    const code=await client.getCode({address:seller.address});reply(200,{deployed:!!code&&code!=='0x',requested:existsSync(journal)});return
   }
   if(req.url==='/api/public-config'){
    const response=await fetch(upstream+req.url,{signal:AbortSignal.timeout(20000)});reply(response.status,await response.json());return
   }
  }
  if(req.method!=='POST'||req.url!=='/api/circle-solana-email'){reply(404,{ok:false});return}
  if(req.headers.origin!==origin){reply(403,{ok:false});return}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>20000){reply(413,{ok:false});return}}
  const request=JSON.parse(body)
  if(!allowed.has(request.action)||request.chain!=='arc'){reply(403,{ok:false,error:'Only the existing seller activation flow is available.'});return}
  if(request.action==='requestEmailOtp'&&request.email?.toLowerCase()!==seller.email){reply(403,{ok:false,error:'Use the designated seller email.'});return}
  if(request.action==='deployEvmWallet'){
   if(request.walletId!==seller.walletId||request.walletAddress?.toLowerCase()!==seller.address.toLowerCase()){reply(403,{ok:false,error:'Seller wallet mismatch.'});return}
   if(existsSync(journal)){reply(409,{ok:false,error:'An activation request already exists. Check its outcome before retrying.'});return}
   if(await client.getChainId()!==5042)throw Error()
   const code=await client.getCode({address:seller.address});if(code&&code!=='0x'){reply(409,{ok:false,error:'Wallet is already deployed.'});return}
   // Exclusive file creation prevents concurrent first requests and survives
   // a server restart. Unknown provider outcomes never enable automatic retry.
   try{writeFileSync(journal,JSON.stringify({status:'requesting',createdAt:new Date().toISOString(),walletId:seller.walletId,address:seller.address}),{flag:'wx'})}
   catch{reply(409,{ok:false,error:'Recover the existing activation request.'});return}
  }
  const response=await fetch(upstream+'/api/circle-solana-email',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(30000)})
  const data=await response.json()
  if(request.action==='deployEvmWallet')save({status:response.ok&&data.challengeId?'challenge_issued':'provider_response_requires_review',createdAt:new Date().toISOString(),walletId:seller.walletId,address:seller.address,...(typeof data.challengeId==='string'?{challengeId:data.challengeId}:{})})
  reply(response.status,data)
 }catch{reply(503,{ok:false,error:'Activation service unavailable. If a request was started, return to the chat for recovery.'})}
}).listen(4390,'127.0.0.1',()=>console.log('Circle seller activation: '+origin))
