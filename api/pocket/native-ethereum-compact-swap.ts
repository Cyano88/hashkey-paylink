import {decodeFunctionData,encodeAbiParameters,getAddress,getCreate2Address,keccak256,parseAbi,type Hex} from 'viem'
import {nativeSwapPair,nativeSwapAssets} from '../../src/pocket/lib/pocketNativeSwap.js'
import type {NativeEvmSwapQuote} from './native-evm-swap-quote.js'
// Sources: Uniswap v3 PoolAddress.sol and Ethereum deployments; OKX CommonUtils/UnxswapV3Router.
export const COMPACT_V3_ABI=parseAbi(['function uniswapV3SwapTo(uint256 receiver,uint256 amount,uint256 minReturn,uint256[] pools) payable returns(uint256 returnAmount)'])
export const ETHEREUM_WETH=getAddress('0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')
const factory=getAddress('0x1F98431c8aD98523631AE4a59f267346ea31F984')
const poolHash='0xe34f199b19b2b4f47f68442619d555527d244f78a3297ea89325f843f87b8b54' as Hex
const ADDRESS=(1n<<160n)-1n,REVERSE=1n<<255n,UNWRAP=1n<<253n
export function ethereumV3Pool(tokenA:Hex,tokenB:Hex,fee:number){
 const [token0,token1]=[getAddress(tokenA),getAddress(tokenB)].sort((a,b)=>BigInt(a)<BigInt(b)?-1:1)
 return {address:getCreate2Address({from:factory,salt:keccak256(encodeAbiParameters([{type:'address'},{type:'address'},{type:'uint24'}],[token0,token1,fee])),bytecodeHash:poolHash}),token0,token1}
}
const tokens=[ETHEREUM_WETH,...nativeSwapAssets('ethereum').filter(a=>!a.native).map(a=>getAddress(a.address))]
const pools=new Map<string,ReturnType<typeof ethereumV3Pool>>()
for(let i=0;i<tokens.length;i++)for(let j=i+1;j<tokens.length;j++)for(const fee of [100,500,3000,10000]){const pool=ethereumV3Pool(tokens[i],tokens[j],fee);pools.set(pool.address.toLowerCase(),pool)}
const same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase()
const address=(word:bigint)=>getAddress('0x'+(word&ADDRESS).toString(16).padStart(40,'0'))
export function validateEthereumCompactSwap(q:NativeEvmSwapQuote){
 const fail=()=>{throw Object.assign(Error('The Ethereum swap path could not be verified.'),{status:422})}
 if(q.network!=='ethereum')fail()
 const {args}=decodeFunctionData({abi:COMPACT_V3_ABI,data:q.tx.data})
 const [receiver,amount,minReturn,route]=args
 // High receiver bits encode the order ID; zero low bits mean msg.sender.
 if((receiver&ADDRESS)!==0n&&!same(address(receiver),q.walletAddress)||amount!==BigInt(q.amountUnits)||minReturn!==BigInt(q.minimumOutUnits)||route.length<1||route.length>3)fail()
 const {tokenIn,tokenOut}=nativeSwapPair('ethereum',q.from,q.to)
 let current=tokenIn.native?ETHEREUM_WETH:tokenIn.address
 const visited=new Set<string>()
 for(let i=0;i<route.length;i++){
  const packed=route[i],poolAddress=address(packed).toLowerCase(),pool=pools.get(poolAddress)
  if((packed&~(ADDRESS|REVERSE|UNWRAP))!==0n||!pool||visited.has(poolAddress))fail()
  visited.add(poolAddress)
  const reverse=(packed&REVERSE)!==0n,unwrap=(packed&UNWRAP)!==0n
  if(unwrap!==(i===route.length-1&&tokenOut.native))fail()
  if(!same(current,reverse?pool!.token1:pool!.token0))fail()
  current=reverse?pool!.token0:pool!.token1
 }
 if(!same(current,tokenOut.native?ETHEREUM_WETH:tokenOut.address))fail()
}
