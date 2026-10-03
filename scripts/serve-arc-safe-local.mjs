import http from 'node:http'
import {readFileSync,writeFileSync,existsSync} from 'node:fs'
import {resolve,dirname} from 'node:path'
import {fileURLToPath} from 'node:url'
const factoryMode=process.argv.includes('--factory')
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),port=factoryMode?4389:4388,host=`127.0.0.1:${port}`
const prefix=factoryMode?'arc-trade-factory':'arc-trade-safe'
const planPath=resolve(root,`.codex-temp/${prefix}-creation.json`),resultPath=resolve(root,`.codex-temp/${prefix}-submitted.json`)
const payload=JSON.parse(readFileSync(planPath,'utf8'))
if(payload.status!==(factoryMode?'simulated-unsigned-trade-factory':'simulated-unsigned-safe-creation')||payload.chainId!==5042||payload.threshold!==2||payload.deployed!==false)throw Error('Invalid creation plan')
payload.deployer='0xaA6EE4589832Fb9FA49c27cB56CBcecf29B847c7'
if(!payload.owners.includes(payload.deployer))throw Error('Rabby must be a planned owner')
// Same ceiling as the recovered local Arc deployment UI. Wallet refreshes fees.
payload.maxGasCostWei='150000000000000000'
const ethers=readFileSync('C:/Users/USER/Desktop/Hash-PayLink-Arc-Mainnet-Deployment/ethers.js')
const style=readFileSync('C:/Users/USER/Desktop/Hash-PayLink-Arc-Mainnet-Deployment/style.css')
const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hash PayLink · Arc Trade Safe</title><link rel="stylesheet" href="/style.css"></head><body><main><p>HASH PAYLINK · ARC MAINNET</p><h1>Create the Trade multisig Safe</h1><p>Rabby signs this creation transaction. The resulting Safe requires both Rabby and SafePal X1 for later approvals. Public funding remains disabled.</p><dl><dt>Network</dt><dd>Arc Mainnet · 5042</dd><dt>Rabby gas payer</dt><dd id="account"></dd><dt>Owners · 2 of 2</dt><dd id="owners"></dd><dt>Predicted Safe</dt><dd id="safe"></dd><dt>Value</dt><dd>0 USDC</dd><dt>Maximum gas allowance</dt><dd id="ceiling"></dd><dt>Creation calldata hash</dt><dd id="hash"></dd></dl><button id="connect" disabled>Connect Rabby</button><button id="deploy" disabled>Review Safe creation in Rabby</button><pre id="status" role="status">Loading the verified plan…</pre><p id="result"></p></main><script src="/ethers.js"></script><script src="/signer.js"></script></body></html>`
const routes={'/':['text/html',html],'/style.css':['text/css',style],'/ethers.js':['text/javascript',ethers],'/signer.js':['text/javascript',readFileSync(resolve(root,'scripts/arc-safe-local-signer.js'))],'/payload.json':['application/json',JSON.stringify(payload)]}
if(factoryMode){
 if(!/^0x[0-9a-f]{40}$/i.test(payload.predictedFactory))throw Error('Invalid factory address')
 routes['/'][1]=html.replace('Create the Trade multisig Safe','Deploy the Trade escrow factory')
  .replace('Rabby signs this creation transaction. The resulting Safe requires both Rabby and SafePal X1 for later approvals. Public funding remains disabled.','Rabby deploys the factory with official Arc USDC and the verified Rabby + SafePal dispute Safe. Public funding remains disabled.')
  .replace('Predicted Safe','Verified dispute Safe')
  .replace('<dt>Value</dt>',`<dt>Predicted factory</dt><dd>${payload.predictedFactory}</dd><dt>Value</dt>`)
  .replace('Review Safe creation in Rabby','Review factory deployment in Rabby')
}
http.createServer(async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
 if(req.headers.host!==host){res.writeHead(403).end();return}
 if(req.method==='POST'&&req.url==='/result'){
  if(req.headers.origin!==`http://${host}`){res.writeHead(403).end();return}
  let body='';for await(const chunk of req){body+=chunk;if(body.length>256){res.writeHead(413).end();return}}
  try{const {hash}=JSON.parse(body);if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error();
   if(existsSync(resultPath)&&JSON.parse(readFileSync(resultPath,'utf8')).hash!==hash){res.writeHead(409).end();return}
   writeFileSync(resultPath,JSON.stringify({hash,calldataHash:payload.calldataHash,predictedSafe:payload.predictedSafe,verified:false,receivedAt:new Date().toISOString()},null,2));res.writeHead(200).end('Saved for verification')
  }catch{res.writeHead(400).end()}return
 }
 const route=routes[req.url];if(req.method!=='GET'||!route){res.writeHead(404).end();return}res.setHeader('Content-Type',route[0]);res.end(route[1])
}).listen(port,'127.0.0.1',()=>console.log(`Arc Safe signing UI: http://${host}`))
