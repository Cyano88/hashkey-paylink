import {readFile} from 'node:fs/promises'
import {createPublicClient,defineChain,http} from 'viem'
import {ARC_AGREEMENT_NETWORK} from '../api/arc-agreement-config.ts'
import {inspectArcTradeRelease,preflightArcTradeRelease} from '../api/trade-agreement/arc-preflight.ts'

const args=process.argv.slice(2)
if(args.includes('--help')){
 console.log('Read-only Arc Trade inspection. No signing, deployment or flag changes.\nnode --import tsx scripts/arc-trade-preflight.mjs [--candidate manifest.json] [--wallets buyer,seller]\nCandidate JSON: {release,executionPolicy}. A candidate pass never enables production. Exit 0: inspection passed; 2: blocked; 1: invalid invocation.')
}else{
 try{
  let candidate,wallets=[]
  for(let i=0;i<args.length;i+=2){if(!args[i+1])throw Error();if(args[i]==='--candidate'&&!candidate)candidate=args[i+1];else if(args[i]==='--wallets'&&!wallets.length)wallets=args[i+1].split(',');else throw Error()}
  const reader=()=>{
   const url=new URL(process.env.PRIVATE_RPC_URL_ARC_MAINNET||ARC_AGREEMENT_NETWORK.rpcUrl)
   if(url.protocol!=='https:'||url.username||url.password)throw Error()
   const chain=defineChain({id:5042,name:'Arc',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:{default:{http:[url.toString()]}}})
   return createPublicClient({chain,transport:http(url.toString(),{timeout:15000,retryCount:1})})
  }
  const report=candidate?await inspectArcTradeRelease({manifest:JSON.parse(await readFile(candidate,'utf8')),wallets,reader}):await preflightArcTradeRelease(wallets,reader)
  console.log(JSON.stringify({scope:candidate?'candidate-inspection':'source-release-inspection',...report},null,2));process.exitCode=report.checksPassed?0:2
 }catch{console.error('Invalid preflight input. Use --help. No transaction was submitted.');process.exitCode=1}
}
