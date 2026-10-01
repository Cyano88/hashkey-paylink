import {createGiftCodeService} from './codes.js'
import {durableGiftCodeStore} from './code-store.js'
import {baseGiftFundingAllowed} from './rollout.js'
import {sameGiftDeployment,validateBaseGiftDeployment} from './deployment.js'
import {publishGiftReceipts} from './receipts.js'
import {createPublicClient,http,type Address} from 'viem'
import {localCurrencyProfileRepository,verifiedPrivyUser} from '../../local-currency-profile.js'
import {circleLinkKey,readCircleLink} from '../../privy-circle-link.js'
import {durableGiftStore} from './store.js'
import {createGiftService} from './service.js'
import {createGiftHandler} from './handler.js'
import {observeGift} from './chain.js'
import {giftCircleChallenge,readGiftFundingAttempt} from './circle.js'
import {GiftError,type GiftDeployment,type GiftNetwork} from './types.js'
// Add only after reviewed deployment, bytecode/token/treasury verification and sponsorship testing.
// No env-only switch can turn an unreviewed contract into a live gift rail.
export const GIFT_DEPLOYMENTS:Readonly<Partial<Record<GiftNetwork,GiftDeployment>>>=Object.freeze({base:{"network":"base","chainId":8453,"escrow":"0x88cff40dcfc7316bad0809969a1a15c19c523441","token":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","treasury":"0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753","runtimeHash":"0xe10654cc0594b7893e4cdd11f0ef009bd2a999a27d625c24e8805e91f851fc11","deploymentBlock":"52026892","confirmations":2}})
const rpc=(network:GiftNetwork)=>({base:process.env.PRIVATE_RPC_URL,arbitrum:process.env.PRIVATE_RPC_URL_ARB,arc:process.env.PRIVATE_RPC_URL_ARC_MAINNET,ethereum:process.env.PRIVATE_RPC_URL_ETHEREUM,polygon:process.env.PRIVATE_RPC_URL_POLYGON}[network])
// Enable only after Base deployment, sponsor and sender recovery checks are recorded.
const BASE_GIFT_FUNDING_REVIEWED=true
export const giftService=createGiftService({fundingEnabled:(network,identity,amount)=>baseGiftFundingAllowed({publicEnabled:BASE_GIFT_FUNDING_REVIEWED,network,identity,amount}),store:durableGiftStore,deployment:network=>{const d=GIFT_DEPLOYMENTS[network];return d?validateBaseGiftDeployment(d):undefined},wallet:async(userId,network)=>{const link=await readCircleLink(circleLinkKey(userId,network));return link?.privyUserId===userId&&link.chain===network?{address:link.circleWalletAddress as Address,id:link.circleWalletId}:undefined},observe:async(record,receiptHint)=>{const deployment=GIFT_DEPLOYMENTS[record.deployment.network],url=rpc(record.deployment.network);if(!deployment||!sameGiftDeployment(deployment,record.deployment)||!url)throw new GiftError(503,'Gift network is not enabled.');return observeGift(createPublicClient({transport:http(url,{timeout:10000,retryCount:1})}),record,receiptHint)},publishReceipts:publishGiftReceipts,readFundingAttempt:readGiftFundingAttempt,challenge:giftCircleChallenge})
export const giftCodeService=createGiftCodeService({store:durableGiftCodeStore,key:()=>process.env.POCKET_GIFT_CODE_KEY||'',gift:id=>durableGiftStore.read(id),view:id=>giftService.view(id)})
export default createGiftHandler({service:giftService,codes:giftCodeService,identity:async req=>{const identity=await verifiedPrivyUser(req),profile=await localCurrencyProfileRepository.get(identity.userId);return {userId:identity.userId,handle:profile?.pocketId||''}}})
