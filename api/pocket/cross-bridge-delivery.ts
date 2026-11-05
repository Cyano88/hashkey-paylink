import {readNativeBridgeDelivery,type NativeBridgeNetwork} from './bridge-native-delivery.js'
import {decodeEventLog,parseAbi} from 'viem'
import {readCanonicalEvmBridgeReceipt} from './bridge-evm-delivery.js'
import {readSolanaBridgeDelivery} from './bridge-solana-delivery.js'
import {crossBridgeAsset} from '../../src/pocket/lib/pocketCrossBridgeAssets.js'
import {sameCrossBridgeAddress,type CrossBridgeDeliveryCandidate} from './cross-bridge-evidence.js'
const transfer=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)'])
/** Native outputs require finalized native-value evidence, not ERC20 logs or a
 * wallet balance. Unsupported trace shapes retain pending state. */
export async function readCrossBridgeDelivery(c:CrossBridgeDeliveryCandidate,options:Parameters<typeof readCanonicalEvmBridgeReceipt>[2]={}){
 const token=crossBridgeAsset(c.network,c.token.symbol),same=sameCrossBridgeAddress
 if(!same(c.network,token.address,c.token.address)||token.decimals!==c.token.decimals||token.native!==c.token.native)throw Error('Bridge settlement asset changed.')
 if(token.native&&c.network!=='solana')return readNativeBridgeDelivery(c.network as NativeBridgeNetwork,c.hash,c.recipient,options)
 if(c.network==='solana'){
  if(token.symbol!=='SOL'&&token.symbol!=='USDC'&&token.symbol!=='USDT')return null
  return readSolanaBridgeDelivery(token.symbol,c.recipient,c.hash)
 }
 const receipt=await readCanonicalEvmBridgeReceipt(c.network,c.hash,options)
 let delta=0n
 for(const log of receipt.logs){
  if(!same(c.network,log.address,token.address))continue
  try{const e=decodeEventLog({abi:transfer,eventName:'Transfer',data:log.data,topics:log.topics as any});delta+=(same(c.network,e.args.to,c.recipient)?e.args.value:0n)-(same(c.network,e.args.from,c.recipient)?e.args.value:0n)}catch{/* Non-transfer logs do not establish delivery. */}
 }
 return delta
}
