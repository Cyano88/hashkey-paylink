import assert from 'node:assert/strict'
import {decodeFunctionData,keccak256} from 'viem'
import {privateKeyToAccount} from 'viem/accounts'
import catalogue from '../src/pocket/lib/pocketXStocksCatalog.json' with {type:'json'}
import {stockGiftFundingReview,prepareStockGiftSettlement} from '../src/pocket/api/pocketStockGiftSettlement.ts'
import {MULTI_GIFT_ABI,multiGiftClaimTypedData} from '../src/pocket/features/gifts/pocketMultiGift.ts'
import {giftContractId} from '../src/pocket/features/gifts/pocketGiftSigning.ts'
const address=n=>'0x'+String(n).repeat(40),hash=n=>'0x'+String(n).repeat(64)
const signer=privateKeyToAccount(hash(1)),authority=privateKeyToAccount(hash(2)),code='0x6000',sender=address(3),owner=address(4),escrow=address(5),treasury=address(6),salt=hash(7)
const asset={chainId:196,rail:'xstocks',token:catalogue.assets[0].address,symbol:catalogue.assets[0].symbol,decimals:18}
const pin={escrow,treasury,authority:authority.address,runtimeHash:keccak256(code),deploymentBlock:'1',confirmations:2,asset}
const base={id:'g_test',attemptId:'attempt',kind:'claim',owner,sender,escrow,giftId:giftContractId(sender,salt),asset,signer:signer.address,salt,amountPerRecipient:'0.001',recipients:1000,expiresAt:'1000'}
const claim={accountId:hash(8),recipient:owner,deadline:'500'}
const typed=multiGiftClaimTypedData({chainId:196,escrow,giftId:base.giftId,accountId:claim.accountId,recipient:owner,deadline:500n})
claim.signature=await signer.signTypedData(typed);claim.accountSignature=await authority.signTypedData(typed)
const intent={...base,claim}
let now=100n,claimed=0,already=false,runtime=code
const rpc={getChainId:async()=>196,getCode:async()=>runtime,getBlock:async()=>({timestamp:now}),getBalance:async()=>1000n,getGasPrice:async()=>1n,estimateGas:async()=>100n,readContract:async r=>({decimals:18,treasury,claimAuthority:authority.address,supportedToken:true,PLATFORM_FEE_BPS:25n,gifts:[sender,asset.token,signer.address,1000000000000000n,1000,claimed,1000n,1],claimedAccount:already,claimedWallet:already}[r.functionName])}
assert.throws(()=>stockGiftFundingReview(intent,owner),/reviewed deployment/)
const call=await prepareStockGiftSettlement(intent,owner,rpc,[pin]);assert.equal(decodeFunctionData({abi:MULTI_GIFT_ABI,data:call.data}).functionName,'claim')
for(const changed of [{owner:sender},{giftId:hash(9)},{amountPerRecipient:'0.002'},{claim:{...claim,recipient:sender}},{claim:{...claim,accountSignature:claim.signature}},{asset:{...asset,decimals:6}}])await assert.rejects(()=>prepareStockGiftSettlement({...intent,...changed},owner,rpc,[pin]))
already=true;await assert.rejects(()=>prepareStockGiftSettlement(intent,owner,rpc,[pin]));already=false;claimed=1000;await assert.rejects(()=>prepareStockGiftSettlement(intent,owner,rpc,[pin]));claimed=7
runtime='0x6001';await assert.rejects(()=>prepareStockGiftSettlement(intent,owner,rpc,[pin]));runtime=code
now=501n;await assert.rejects(()=>prepareStockGiftSettlement(intent,owner,rpc,[pin]))
const refund={...base,kind:'refund',owner:sender}
await assert.rejects(()=>prepareStockGiftSettlement(refund,sender,rpc,[pin]));now=1000n
const refundCall=await prepareStockGiftSettlement(refund,sender,rpc,[pin]);assert.equal(decodeFunctionData({abi:MULTI_GIFT_ABI,data:refundCall.data}).functionName,'refundExpired')
await assert.rejects(()=>prepareStockGiftSettlement({...refund,owner},owner,rpc,[pin]))
console.log('PASS stock claim/refund: pinned deployment, both signatures, wallet/account binding, capacity, expiry, changed quantities and contract rejection, sender-only partial refund.')
