import assert from 'node:assert/strict'
import { encodeFunctionData, encodeEventTopics, encodeAbiParameters, parseAbi, parseAbiParameters, pad } from 'viem'
import { ARC_SWAP_ROUTER, swapToken, readArcSwapToken, quoteArcSwap, sealArcSwapQuote, openArcSwapQuote, validateArcSwapQuote, confirmedArcSwapAmount } from '../api/pocket/arc-swap-provider.ts'
import { verifyEvmUsdcTransfer } from '../api/usdc-transfer-verify.ts'
import { readCctpForwardQuote } from '../api/pocket/cctp.ts'
import { arcSwapQuotePreview } from '../api/pocket/arc-swap.ts'
const wallet='0x1111111111111111111111111111111111111111'
const other='0x2222222222222222222222222222222222222222'
const tokenIn={chainId:5042,address:'0x3600000000000000000000000000000000000000',symbol:'USDC',decimals:6}
const tokenOut={chainId:5042,address:'0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1',symbol:'EURC',decimals:6}
const id='0x'+'12'.repeat(32)
const abi=parseAbi(['function swapTokensMultipleV3ERC20ToERC20(bytes32,string,string,address,uint256,(address callTo,address approveTo,address sendingAssetId,address receivingAssetId,uint256 fromAmount,bytes callData,bool requiresDeposit)[])'])
const calldata=(receiver=wallet,minimum=9950000n)=>encodeFunctionData({abi,functionName:'swapTokensMultipleV3ERC20ToERC20',args:[id,'hashpaylink','',receiver,minimum,[{callTo:other,approveTo:other,sendingAssetId:tokenIn.address,receivingAssetId:tokenOut.address,fromAmount:10000000n,callData:'0x12345678',requiresDeposit:true}]]})
const fixture={action:{fromChainId:5042,toChainId:5042,fromAddress:wallet,toAddress:wallet,fromToken:tokenIn,toToken:tokenOut,fromAmount:'10000000'},transactionRequest:{from:wallet,to:ARC_SWAP_ROUTER,chainId:5042,value:'0',data:calldata()},estimate:{approvalAddress:ARC_SWAP_ROUTER,toAmount:'10000000',toAmountMin:'9950000',gasCosts:[],feeCosts:[]},includedSteps:[{type:'swap',action:{fromChainId:5042,toChainId:5042}}]}
const input={walletAddress:wallet,tokenIn,tokenOut,amountUnits:10000000n}
validateArcSwapQuote(fixture,input)
for(const mutate of [
 d=>d.action.toChainId=8453,d=>d.transactionRequest.to=other,d=>d.estimate.approvalAddress=other,
 d=>d.transactionRequest.value='1',d=>d.transactionRequest.data=calldata(other),
 d=>d.transactionRequest.data=calldata(wallet,1n),d=>d.action.fromAmount='10000001',
 d=>d.estimate.toAmountMin='1',d=>d.includedSteps[0].type='cross'
]){const changed=structuredClone(fixture);mutate(changed);assert.throws(()=>validateArcSwapQuote(changed,input))}
const fetcher=async url=>new Response(JSON.stringify(String(url).includes('/tokens?')?{tokens:{'5042':[tokenIn,tokenOut]}}:fixture))
const quote=await quoteArcSwap({ownerId:'owner',walletId:'wallet',walletAddress:wallet,tokenIn:tokenIn.address,tokenOut:tokenOut.address,amount:'10'},fetcher)

assert.equal(swapToken({...tokenIn,logoURI:'https://example.com/usdc.png'}).logoURI,'https://example.com/usdc.png')
for(const logoURI of ['javascript:alert(1)','data:image/svg+xml,bad','http://example.com/a.png','https://user:pass@example.com/a.png']) assert.equal(swapToken({...tokenIn,logoURI}).logoURI,undefined)
process.env.POCKET_SWAP_QUOTE_SECRET='fixture-preview-secret-thirty-two-characters'
for(const balance of [0n,10000000n,20000000n]) {
 const preview=await arcSwapQuotePreview(quote,async()=>balance)
 assert.equal(preview.ok,true)
 assert.equal(preview.quote.expectedOut,quote.expectedOut,'Price stays visible even without funds')
 assert.equal(preview.sufficientBalance,balance>=BigInt(quote.amountUnits))
 assert.equal(preview.balanceStatus,'ok')
 assert.ok(preview.quoteToken)
}
const unavailable=await arcSwapQuotePreview(quote,async()=>{throw Error('RPC unavailable')})
assert.equal(unavailable.ok,true)
assert.equal(unavailable.balance,null)
assert.equal(unavailable.sufficientBalance,null)
assert.equal(unavailable.balanceStatus,'unavailable')

await assert.rejects(()=>quoteArcSwap({ownerId:'owner',walletId:'wallet',walletAddress:wallet,tokenIn:tokenIn.address,tokenOut:tokenOut.address,amount:'0.0000001'},fetcher),/precision/)
await assert.rejects(() => readArcSwapToken('not-an-address', fetcher), /valid Arc/)
await assert.rejects(() => readArcSwapToken(tokenIn.address, async () => new Response(JSON.stringify({...tokenIn,chainId:8453}))), /Unsupported Arc/)
await assert.rejects(() => readArcSwapToken(tokenIn.address, async () => new Response(JSON.stringify(tokenOut))), /different contract/)
const discoveredQuote = await quoteArcSwap({ownerId:'owner',walletId:'wallet',walletAddress:wallet,tokenIn:tokenIn.address,tokenOut:tokenOut.address,amount:'10'}, async url => new Response(JSON.stringify(String(url).includes('/tokens?') ? {tokens:{'5042':[tokenIn]}} : String(url).includes('/token?') ? tokenOut : fixture)))
assert.equal(discoveredQuote.tokenOut.address.toLowerCase(), tokenOut.address.toLowerCase(), 'Contract-discovered token still passes exact route validation')
const secret='fixture-secret-at-least-thirty-two-characters'
const sealed=sealArcSwapQuote(quote,secret)
assert.equal(openArcSwapQuote(sealed,'owner',false,secret).id,quote.id)
assert.throws(()=>openArcSwapQuote(sealed,'another',false,secret),/another/)
assert.throws(()=>openArcSwapQuote(sealed.slice(0,-5)+'aaaaa','owner',false,secret),/Invalid/)
assert.throws(()=>openArcSwapQuote(sealArcSwapQuote({...quote,expiresAt:0},secret),'owner',false,secret),/expired/)
const events=parseAbi(['event LiFiGenericSwapCompleted(bytes32 indexed transactionId,string integrator,string referrer,address receiver,address fromAssetId,address toAssetId,uint256 fromAmount,uint256 toAmount)','event Transfer(address indexed from,address indexed to,uint256 value)'])
const completion={address:ARC_SWAP_ROUTER,topics:encodeEventTopics({abi:events,eventName:'LiFiGenericSwapCompleted',args:{transactionId:id}}),data:encodeAbiParameters(parseAbiParameters('string,string,address,address,address,uint256,uint256'),['hashpaylink','',wallet,tokenIn.address,tokenOut.address,10000000n,10000000n])}
const transfer=(address,from,to,value)=>({address,topics:encodeEventTopics({abi:events,eventName:'Transfer',args:{from,to}}),data:encodeAbiParameters(parseAbiParameters('uint256'),[value])})
const logs=[completion,transfer(tokenIn.address,wallet,ARC_SWAP_ROUTER,10000000n),transfer(tokenOut.address,ARC_SWAP_ROUTER,wallet,10000000n)]
assert.equal(confirmedArcSwapAmount(quote,{status:'success',logs}),'10')
assert.equal(confirmedArcSwapAmount(quote,{status:'reverted',logs}),null)
assert.equal(confirmedArcSwapAmount(quote,{status:'success',logs:[completion]}),null,'An event without actual wallet token transfers is not settlement')
assert.equal(confirmedArcSwapAmount(quote,{status:'success',logs:[...logs,transfer(tokenOut.address,wallet,other,10000000n)]}),null)
const oldFetch=globalThis.fetch
try{
 globalThis.fetch=async()=>new Response(JSON.stringify([{finalityThreshold:1000,minimumFee:'0.325',forwardFee:{med:'19153'}},{finalityThreshold:2000,minimumFee:'0',forwardFee:{med:'19153'}}]))
 const arc=await readCctpForwardQuote('arc','base',10000000n)
 assert.equal(arc.finalityThreshold,2000)
 assert.equal(arc.totalUnits,10019153n)
 const base=await readCctpForwardQuote('base','arc',10000000n)
 assert.equal(base.finalityThreshold,1000)
 assert.ok(base.maxFeeUnits>=19153n+(base.totalUnits*325n+9999999n)/10000000n)
 globalThis.fetch=async(_url,init)=>{
 const {method}=JSON.parse(init.body)
 return new Response(JSON.stringify({result:method==='eth_getBlockByNumber'?{timestamp:'0x65000000'}:{status:'0x1',blockNumber:'0x10',logs:[transfer('0xfffffffffffffffffffffffffffffffffffffffe',wallet,other,10000000000000000000n),transfer(tokenIn.address,wallet,other,10000000n)]}}))
 }
 const receipt=await verifyEvmUsdcTransfer({chain:'arc',txHash:'0x'+'a'.repeat(64),payer:wallet,recipient:other,minAmount:'10'})
 assert.equal(receipt.amount,'10','Native and ERC20 USDC logs must not double count')
 await assert.rejects(()=>verifyEvmUsdcTransfer({chain:'arc',txHash:'0x'+'a'.repeat(64),payer:wallet,recipient:other,minAmount:'11'}))
}finally{globalThis.fetch=oldFetch}
console.log('Arc swaps/mainnet checks passed: route restrictions, exact amounts, signed quotes, settlement transfers, CCTP fees and native USDC accounting.')
