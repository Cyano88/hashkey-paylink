import {decodeFunctionData,parseAbi,keccak256,type Address,type Hex,type PublicClient} from 'viem'
import {MULTI_GIFT_ABI,prepareMultiGiftFunding,type MultiGiftAsset} from '../features/gifts/pocketMultiGift'
import {preflightStockGiftCall,readStockGiftAsset,sameStockGiftAsset} from './pocketStockGiftAsset'
export type StockGiftFundingReview={owner:Address;escrow:Address;runtimeHash:Hex;treasury:Address;authority:Address;asset:MultiGiftAsset;signer:Address;salt:Hex;amountPerRecipient:string;recipients:number;expiresAt:bigint}
const configAbi=parseAbi(['function treasury() view returns(address)','function claimAuthority() view returns(address)','function supportedToken(address) view returns(bool)','function PLATFORM_FEE_BPS() view returns(uint256)'])
const tokenAbi=parseAbi(['function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)'])
/** No raw server-supplied calldata is signed. Callers must supply a pinned deployment and reviewed quantity. */
export async function prepareStockGiftFundingCalls(review:StockGiftFundingReview,client:PublicClient,now:bigint){
 const asset=await readStockGiftAsset(review.asset.token,client)
 if(!sameStockGiftAsset(asset,review.asset))throw Error('Stock details changed. Review the gift again.')
 const [code,treasury,authority,supported,fee]=await Promise.all([client.getCode({address:review.escrow}),client.readContract({address:review.escrow,abi:configAbi,functionName:'treasury'}),client.readContract({address:review.escrow,abi:configAbi,functionName:'claimAuthority'}),client.readContract({address:review.escrow,abi:configAbi,functionName:'supportedToken',args:[asset.token]}),client.readContract({address:review.escrow,abi:configAbi,functionName:'PLATFORM_FEE_BPS'})])
 if(!code||keccak256(code)!==review.runtimeHash||treasury.toLowerCase()!==review.treasury.toLowerCase()||authority.toLowerCase()!==review.authority.toLowerCase()||!supported||fee!==25n)throw Error('Stock gift contract could not be verified.')
 const plan=prepareMultiGiftFunding({sender:review.owner,escrow:review.escrow,asset,signer:review.signer,salt:review.salt,amountPerRecipient:review.amountPerRecipient,recipients:review.recipients,expiresAt:review.expiresAt,now})
 const existing=await client.readContract({address:review.escrow,abi:MULTI_GIFT_ABI,functionName:'gifts',args:[plan.giftId]})
 if(existing[7]!==0)throw Error('This gift already has on-chain activity. Refresh its status before continuing.')
 const [balance,allowance]=await Promise.all([client.readContract({address:asset.token,abi:tokenAbi,functionName:'balanceOf',args:[review.owner]}),client.readContract({address:asset.token,abi:tokenAbi,functionName:'allowance',args:[review.owner,review.escrow]})])
 if(balance<plan.totalDebit)throw Error('Not enough stock for the gift and creation fee.')
 return {plan,calls:[...(allowance<plan.totalDebit?[{...plan.approval,value:0n as const}]:[]),{...plan.funding,value:0n as const}]}
}
/** Each stage is regenerated against RPC state. The wallet supplies durable submission/recovery and PIN approval. */
export async function executeStockGiftFunding(review:StockGiftFundingReview,deps:{client:PublicClient;assertCurrent():void;now():bigint;approve():Promise<void>;submit(call:{to:Address;data:Hex;value:0n},kind:'approval'|'funding'):Promise<Hex>}){
 await deps.approve();deps.assertCurrent()
 let prepared=await prepareStockGiftFundingCalls(review,deps.client,deps.now())
 if(prepared.calls.length===2){const call=prepared.calls[0];await preflightStockGiftCall(review.owner,call,deps.client);deps.assertCurrent();const hash=await deps.submit(call,'approval');const receipt=await deps.client.waitForTransactionReceipt({hash,timeout:45000});if(receipt.status!=='success')throw Error('Stock approval did not complete.');deps.assertCurrent();prepared=await prepareStockGiftFundingCalls(review,deps.client,deps.now());if(prepared.calls.length!==1)throw Error('Stock approval has not been confirmed.')}
 const call=prepared.calls[0];const decoded=decodeFunctionData({abi:MULTI_GIFT_ABI,data:call.data});if(decoded.functionName!=='createGift')throw Error('Invalid gift execution step.')
 await preflightStockGiftCall(review.owner,call,deps.client);deps.assertCurrent();return deps.submit(call,'funding')
}
