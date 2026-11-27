import {type Hex,formatEther,encodeFunctionData,parseAbi} from 'viem'
import {inboundBridgeClient} from './inbound-bridge-networks.js'
import {privyKernel} from './xlayer-sponsored-cost.js'

// Simulate the exact self-paid Kernel transaction. Only model the expected
// first-use delegation; balances, token allowances and contract storage are real.
export async function celoCashGas(owner:Hex,data:Hex,env:NodeJS.ProcessEnv){
 const client=inboundBridgeClient('celo',env)
 const [chain,code,price,balance]=await Promise.all([client.getChainId(),client.getCode({address:owner}),client.getGasPrice(),client.getBalance({address:owner})])
 const delegation='0xef0100'+privyKernel.slice(2)
 if(chain!==42220||price<=0n||(code&&code!=='0x'&&code.toLowerCase()!==delegation))throw Error('Celo wallet details changed.')
 const firstUse=!code||code==='0x'
 const extra=firstUse?[{[owner]:{code:delegation}}]:[]
 const gas=BigInt(await client.request({method:'eth_estimateGas',params:[{from:owner,to:owner,value:'0x0',data},'latest',...extra]} as any) as string)
 if(gas<=0n||gas>10000000n)throw Error('The Celo network fee is unavailable.')
 const bytes=BigInt((data.length-2)/2+512)
 const oracle=await client.call({to:'0x420000000000000000000000000000000000000F',data:encodeFunctionData({abi:parseAbi(['function getL1FeeUpperBound(uint256) view returns (uint256)']),functionName:'getL1FeeUpperBound',args:[bytes]})})
 if(!oracle.data||!/^0x[0-9a-f]{64}$/i.test(oracle.data))throw Error('The Celo network fee is unavailable.')
 const units=((gas+(firstUse?25000n:0n))*price+BigInt(oracle.data))*125n/100n+1n
 if(balance<units)throw Object.assign(Error('Add CELO to cover the estimated network fee of '+formatEther(units)+' CELO.'),{status:422,code:'celo_cash_gas_needed'})
 return {units,balance,estimatedUnits:(units-1n)*100n/125n}
}
