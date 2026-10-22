import {decodeFunctionData, encodeFunctionData, formatUnits, parseAbi, type Abi, type Hex} from 'viem'
import routerAbi from '../../src/pocket/lib/pocketOkxRouterAbi.json'
import {pocketBscAsset} from '../../src/pocket/lib/pocketBsc.js'
import {type BscSwapQuote} from '../../src/pocket/lib/pocketBscSwap.js'
import {readStockSwapFee} from '../../src/pocket/lib/pocketXStocksSwap.js'

const compactAbi = parseAbi(['function unxswapTo(uint256 srcToken,uint256 amount,uint256 minReturn,address receiver,bytes32[] pools) payable returns(uint256)'])
const mask = (1n << 160n) - 1n
const invalid = (): never => {throw Error('BSC swap details changed. Review the swap again.')}

/** OKX's two UNX entry points call the same internal swap. Bind compact calls
 * to the existing token/deadline-checked entry point before signing. Unknown
 * selectors remain subject to the normal strict validator. */
export function normalizeBscProviderCall(q: BscSwapQuote): BscSwapQuote {
  if (q.tx.data?.slice(0, 10).toLowerCase() !== '0x08298b5a') return q
  const {args} = decodeFunctionData({abi: compactAbi, data: q.tx.data})
  const [source, amount, minimum, receiver, pools] = args
  const input = pocketBscAsset(q.from), output = pocketBscAsset(q.to)
  if ((source & mask) !== BigInt(input.address) && !(input.native && (source & mask) === 0n)) invalid()
  if (amount !== BigInt(q.tradeInputUnits) || minimum !== BigInt(q.minimumOutUnits) || pools.length === 0
    || (BigInt(receiver) !== 0n && receiver.toLowerCase() !== q.walletAddress.toLowerCase())) invalid()
  // Also verifies canonical encoding and rejects all unrecognized trailers.
  readStockSwapFee({tx: q.tx, expectedOut: formatUnits(BigInt(q.expectedOutUnits), 18), decimalsOut: 18}, compactAbi)
  const canonical = encodeFunctionData({abi: compactAbi, functionName: 'unxswapTo', args})
  const tail = q.tx.data.slice(canonical.length)
  const data = encodeFunctionData({abi: routerAbi as Abi, functionName: 'unxswapToWithBaseRequest', args: [source >> 160n, q.walletAddress,
    {fromToken: BigInt(input.address), toToken: output.address, fromTokenAmount: amount, minReturnAmount: minimum,
      deadLine: BigInt(Math.ceil(q.expiresAt / 1000))}, pools]})
  return {...q, tx: {...q.tx, data: (data + tail) as Hex}}
}
